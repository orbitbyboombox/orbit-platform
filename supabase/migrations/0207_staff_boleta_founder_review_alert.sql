begin;

-- Boleta review is a canonical Founder action, independent of the Staff upload
-- path. Keep the existing reconciliation behavior and add this projection.
alter function public.reconcile_founder_action_alerts() rename to reconcile_founder_action_alerts_legacy;

create or replace function public.sync_staff_boleta_review_alerts()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare affected integer:=0;
begin
  insert into public.internal_notifications(
    staff_id,notification_type,title,message,status,correlation_id,category,priority,
    action_required,entity_type,entity_id,related_href,metadata
  )
  select
    a.staff_id,'STAFF_BOLETA_REVIEW_REQUIRED','BOLETA STAFF PENDIENTE DE REVISIÓN',
    concat(s.first_name,' ',s.last_name,' · período ',to_char(a.accounting_month,'YYYY-MM')),
    'UNREAD','founder-action:staff-boleta:'||a.id,'STAFF','HIGH',true,
    'StaffMonthlyAccount',a.id::text,
    '/resources/staff?reviewAccount='||a.id,
    jsonb_build_object('source','CANONICAL_PENDING_STATE','accountId',a.id,'staffId',a.staff_id,
      'accountingMonth',a.accounting_month,'boletaDocumentId',a.boleta_document_id)
  from public.staff_monthly_accounts a
  join public.staff s on s.id=a.staff_id
  where a.boleta_status='RECEIVED'
  on conflict(correlation_id) do update set
    staff_id=excluded.staff_id,title=excluded.title,message=excluded.message,status='UNREAD',
    category=excluded.category,priority=excluded.priority,action_required=true,
    entity_type=excluded.entity_type,entity_id=excluded.entity_id,related_href=excluded.related_href,
    metadata=excluded.metadata;
  get diagnostics affected=row_count;

  update public.internal_notifications n
  set status='RESOLVED',action_required=false,read_at=coalesce(n.read_at,now())
  where n.notification_type='STAFF_BOLETA_REVIEW_REQUIRED' and n.status<>'RESOLVED'
    and not exists(select 1 from public.staff_monthly_accounts a
      where a.id::text=n.entity_id and a.boleta_status='RECEIVED');
  return affected;
end;
$$;

create or replace function public.reconcile_founder_action_alerts()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare result jsonb;
begin
  if auth.role()<>'service_role' and not public.can_administer() then
    raise exception 'Solo Founder o Administración puede reconciliar pendientes.';
  end if;
  result:=public.reconcile_founder_action_alerts_legacy();
  perform public.sync_staff_boleta_review_alerts();
  return result||jsonb_build_object('staffBoletaReview','reconciled');
end;
$$;

revoke all on function public.sync_staff_boleta_review_alerts() from public,anon;
grant execute on function public.sync_staff_boleta_review_alerts() to authenticated,service_role;
revoke all on function public.reconcile_founder_action_alerts() from public,anon;
grant execute on function public.reconcile_founder_action_alerts() to authenticated,service_role;

create or replace function public.sync_staff_boleta_review_alerts_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.sync_staff_boleta_review_alerts(); return null; end;
$$;

-- Recreate trigger after defining its function (Postgres resolves at creation).
drop trigger if exists staff_monthly_boleta_review_alert on public.staff_monthly_accounts;
create trigger staff_monthly_boleta_review_alert
after insert or update of boleta_status,boleta_document_id on public.staff_monthly_accounts
for each statement execute function public.sync_staff_boleta_review_alerts_trigger();

select public.reconcile_founder_action_alerts();
commit;
