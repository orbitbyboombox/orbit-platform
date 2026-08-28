begin;

create or replace function public.get_overdue_receivable_summary()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'count',count(*)::integer,
    'total',coalesce(sum(r.outstanding_balance),0),
    'oldestDueDate',min(r.due_date)
  )
  from public.accounts_receivable_projection r
  where r.outstanding_balance>0
    and r.due_date<timezone('America/Santiago',now())::date
    and upper(r.effective_status) not in('ARCHIVED','CANCELLED','CANCELED','DELETED','PAID','VOID')
$$;

revoke all on function public.get_overdue_receivable_summary() from public,anon;
grant execute on function public.get_overdue_receivable_summary() to authenticated,service_role;

create or replace function public.reconcile_founder_action_alerts()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  base_result jsonb;
  resolved_temporal integer := 0;
  affected integer;
  chile_today date := timezone('America/Santiago',now())::date;
begin
  if auth.role()<>'service_role' and not public.can_administer() then
    raise exception 'Solo Founder o Administración puede reconciliar pendientes.';
  end if;

  base_result:=public.reconcile_founder_action_alerts_base();

  -- Financial reminders are a derived grouped action. Preserve their audit rows,
  -- but remove every individual invoice reminder from the live Founder queue.
  update public.internal_notifications
  set status='RESOLVED',action_required=false,read_at=coalesce(read_at,now())
  where notification_type in('INVOICE_OVERDUE','INVOICE_DUE_TODAY','INVOICE_DUE_SOON')
    and status<>'RESOLVED';
  get diagnostics affected=row_count;
  resolved_temporal:=resolved_temporal+affected;

  update public.internal_notifications n
  set
    title='Evento en '||(p.event_date-chile_today)||' días · operación pendiente',
    message=jsonb_array_length(coalesce(c.readiness_reasons,'[]'::jsonb))||' requisitos críticos continúan pendientes.',
    priority=case when p.event_date-chile_today<=1 then 'CRITICAL' else 'HIGH' end,
    status='UNREAD',action_required=true,
    metadata=coalesce(n.metadata,'{}'::jsonb)||jsonb_build_object('daysUntil',p.event_date-chile_today,'source','CANONICAL_PENDING_STATE')
  from public.projects p
  join public.project_operational_contracts c on c.project_id=p.id
  where n.notification_type='EVENT_NOT_READY' and n.entity_id=p.id::text
    and p.deleted_at is null
    and upper(p.status) not in('ARCHIVED','CANCELLED','DELETED')
    and p.event_date between chile_today and chile_today+5
    and c.readiness_status='NOT_READY';

  update public.internal_notifications n
  set status='RESOLVED',action_required=false,read_at=coalesce(n.read_at,now())
  where n.notification_type='EVENT_NOT_READY' and n.status<>'RESOLVED'
    and not exists(
      select 1 from public.projects p
      join public.project_operational_contracts c on c.project_id=p.id
      where p.id::text=n.entity_id
        and p.deleted_at is null
        and upper(p.status) not in('ARCHIVED','CANCELLED','DELETED')
        and p.event_date between chile_today and chile_today+5
        and c.readiness_status='NOT_READY'
    );
  get diagnostics affected=row_count;
  resolved_temporal:=resolved_temporal+affected;

  return base_result||jsonb_build_object('resolvedTemporal',resolved_temporal);
end;
$$;

revoke all on function public.reconcile_founder_action_alerts() from public,anon;
grant execute on function public.reconcile_founder_action_alerts() to authenticated,service_role;

-- Retain the legacy callable contract while making it projection-only. Opening
-- Cobrar Clientes must never mutate invoices or emit one notification per row.
create or replace function public.refresh_receivable_notifications()
returns integer
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_internal_user() then
    raise exception 'Acceso interno requerido.';
  end if;
  perform public.reconcile_founder_action_alerts();
  return 0;
end;
$$;

revoke all on function public.refresh_receivable_notifications() from public,anon;
grant execute on function public.refresh_receivable_notifications() to authenticated,service_role;

select public.reconcile_founder_action_alerts();

commit;
