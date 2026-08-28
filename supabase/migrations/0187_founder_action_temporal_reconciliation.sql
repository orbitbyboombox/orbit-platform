begin;

alter function public.reconcile_founder_action_alerts() rename to reconcile_founder_action_alerts_base;
revoke all on function public.reconcile_founder_action_alerts_base() from public,anon,authenticated;

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
  if auth.role() <> 'service_role' and not public.can_administer() then
    raise exception 'Solo Founder o Administración puede reconciliar pendientes.';
  end if;

  base_result:=public.reconcile_founder_action_alerts_base();

  update public.internal_notifications
  set status='RESOLVED',action_required=false,read_at=coalesce(read_at,now())
  where notification_type in('INVOICE_OVERDUE','INVOICE_DUE_TODAY','INVOICE_DUE_SOON')
    and correlation_id not like 'founder-action:invoice:%'
    and status<>'RESOLVED';
  get diagnostics affected=row_count;
  resolved_temporal:=resolved_temporal+affected;

  insert into public.internal_notifications(
    project_id,customer_id,notification_type,title,message,status,correlation_id,
    category,priority,action_required,entity_type,entity_id,related_href,metadata
  )
  select
    r.project_id,r.customer_id,
    case when r.days_remaining<0 then 'INVOICE_OVERDUE' when r.days_remaining=0 then 'INVOICE_DUE_TODAY' else 'INVOICE_DUE_SOON' end,
    case when r.days_remaining<0 then 'Factura vencida' when r.days_remaining=0 then 'Factura vence hoy' else 'Factura próxima a vencer' end,
    r.invoice_number||' · saldo '||to_char(r.outstanding_balance,'FM$999G999G999'),
    'UNREAD','founder-action:invoice:'||r.id,'PAYMENTS',
    case when r.days_remaining<0 then 'CRITICAL' when r.days_remaining=0 then 'HIGH' else 'NORMAL' end,
    true,'Invoice',r.id::text,'/finance/receivables',
    jsonb_build_object('source','CANONICAL_PENDING_STATE','daysRemaining',r.days_remaining,'outstandingBalance',r.outstanding_balance)
  from public.accounts_receivable_projection r
  where r.effective_status in('PENDING','PARTIALLY_PAID','OVERDUE') and r.days_remaining<=7
  on conflict(correlation_id) do update set
    project_id=excluded.project_id,customer_id=excluded.customer_id,
    notification_type=excluded.notification_type,title=excluded.title,message=excluded.message,
    status='UNREAD',category=excluded.category,priority=excluded.priority,
    action_required=true,entity_type=excluded.entity_type,entity_id=excluded.entity_id,
    related_href=excluded.related_href,metadata=excluded.metadata;

  update public.internal_notifications n
  set status='RESOLVED',action_required=false,read_at=coalesce(n.read_at,now())
  where n.correlation_id like 'founder-action:invoice:%' and n.status<>'RESOLVED'
    and not exists(
      select 1 from public.accounts_receivable_projection r
      where r.id::text=n.entity_id
        and r.effective_status in('PENDING','PARTIALLY_PAID','OVERDUE')
        and r.days_remaining<=7
    );
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

select public.reconcile_founder_action_alerts();

commit;
