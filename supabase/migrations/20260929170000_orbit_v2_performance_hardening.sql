begin;

create index if not exists audit_events_entity_type_occurred_at_idx
  on public.audit_events(entity_type, occurred_at desc);

create index if not exists timeline_events_occurred_at_id_idx
  on public.timeline_events(occurred_at desc, id desc);

create index if not exists documents_project_type_active_idx
  on public.documents(project_id, document_type)
  where deleted_at is null;

create index if not exists internal_notifications_project_created_idx
  on public.internal_notifications(project_id, created_at desc)
  where status <> 'RESOLVED';

drop index if exists public.quotations_professional_number_uidx;

create or replace function public.bump_project_event_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (
    old.event_date is distinct from new.event_date
    or old.event_time is distinct from new.event_time
    or old.event_time_mode is distinct from new.event_time_mode
    or old.location is distinct from new.location
    or old.city is distinct from new.city
    or old.project_type is distinct from new.project_type
    or old.operations is distinct from new.operations
    or old.status is distinct from new.status
  ) then
    new.event_revision := greatest(coalesce(new.event_revision, old.event_revision), old.event_revision + 1);
  else
    new.event_revision := greatest(coalesce(new.event_revision, old.event_revision), old.event_revision);
  end if;
  return new;
end;
$$;

create or replace function public.bump_related_project_event_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
begin
  v_project_id := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
  if v_project_id is not null then
    update public.projects
       set event_revision = event_revision + 1
     where id = v_project_id;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.bump_related_project_event_revision() from public, anon, authenticated;
grant execute on function public.bump_related_project_event_revision() to service_role;

drop trigger if exists project_services_event_revision on public.project_services;
create trigger project_services_event_revision
after insert or update or delete on public.project_services
for each row execute function public.bump_related_project_event_revision();

drop trigger if exists event_post_reservation_extras_event_revision on public.event_post_reservation_extras;
create trigger event_post_reservation_extras_event_revision
after insert or update or delete on public.event_post_reservation_extras
for each row execute function public.bump_related_project_event_revision();

drop trigger if exists project_operational_contracts_event_revision on public.project_operational_contracts;
create trigger project_operational_contracts_event_revision
after insert or update or delete on public.project_operational_contracts
for each row execute function public.bump_related_project_event_revision();

drop trigger if exists assignments_event_revision on public.assignments;
create trigger assignments_event_revision
after insert or delete or update of staff_call_at, staff_call_source, status, assignment_type, staff_id
on public.assignments
for each row execute function public.bump_related_project_event_revision();

create or replace function public.operations_drive_ready_projects()
returns table(project_id uuid)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select distinct x.project_id
  from (
    select ds.project_id
      from public.drive_sync ds
     where ds.status in ('CREATED','UPDATED')
    union
    select d.project_id
      from public.documents d
     where d.deleted_at is null
  ) x
  where x.project_id is not null;
$$;

revoke all on function public.operations_drive_ready_projects() from public, anon;
grant execute on function public.operations_drive_ready_projects() to authenticated, service_role;

alter function public.calculate_staff_call_at(timestamp with time zone) set search_path = public, pg_temp;
alter function public.invoice_term_days(text, integer) set search_path = public, pg_temp;
alter function public.commercial_reservation_status(text) set search_path = public, pg_temp;
alter function public.preview_receivable_payment_receipt_backfill() set search_path = public, pg_temp;
alter function public.receivable_movement_cash_impact(text, numeric, numeric, jsonb) set search_path = public, pg_temp;
alter function public.invoice_payment_cash_impact(text, numeric) set search_path = public, pg_temp;
alter function public.staff_settlement_original_net(public.event_staff_payments) set search_path = public, pg_temp;

update public.calendar_sync cs
   set status = 'DELETED',
       next_retry_at = null,
       sync_started_at = null,
       last_error = null,
       last_error_code = null,
       updated_at = now()
  from public.projects p
 where p.id = cs.project_id
   and upper(coalesce(p.status,'')) in ('CANCELLED','CANCELED','CANCELADO','CANCELADA')
   and cs.status = 'FAILED'
   and cs.external_event_id is null
   and cs.nova_external_event_id is null;

commit;
