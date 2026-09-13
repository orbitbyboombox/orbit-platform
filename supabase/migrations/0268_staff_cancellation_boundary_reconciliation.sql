begin;

-- Closed/archived projects are historical and have no operational readiness
-- contract to refresh. Skipping them prevents cancellation cleanup from being
-- rejected by a readiness trigger after the event is already closed.
create or replace function public.event_readiness_source_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare project_id_value uuid; closed boolean;
begin
  if tg_table_name = 'event_checklist_items' then
    select project_id into project_id_value from public.event_checklists
    where id = coalesce(new.checklist_id, old.checklist_id);
  else
    project_id_value := coalesce(new.project_id, old.project_id);
  end if;
  select deleted_at is not null or upper(coalesce(status,'')) in ('CANCELLED','CANCELED','CLOSED','ARCHIVED')
  into closed from public.projects where id = project_id_value;
  if coalesce(closed,false) then return coalesce(new,old); end if;
  if exists(select 1 from public.project_operational_contracts where project_id=project_id_value) then
    perform public.refresh_event_operational_readiness(project_id_value,auth.uid());
  end if;
  return coalesce(new,old);
end;
$$;

-- Capability validation applies to active obligations only. Cancellation must
-- remain possible after a Staff profile is deactivated, otherwise the
-- settlement cleanup trigger aborts the canonical cancellation boundary.
create or replace function public.validate_staff_capabilities()
returns trigger
language plpgsql
set search_path = public
as $$
declare allowed text[]; member_status text;
begin
  if upper(coalesce(new.status,'')) = 'CANCELLED' or new.deleted_at is not null then
    return new;
  end if;
  select capabilities,status into allowed,member_status
  from public.staff where id=new.staff_id and deleted_at is null;
  if allowed is null or member_status <> 'ACTIVE' then raise exception 'Staff no disponible.'; end if;
  if new.assembly_payment > 0 and not ('ASSEMBLY'=any(allowed)) then raise exception 'Staff sin capacidad de montaje.'; end if;
  if new.operator_payment > 0 and not ('OPERATOR'=any(allowed)) then raise exception 'Staff sin capacidad de operación.'; end if;
  if new.disassembly_payment > 0 and not ('DISASSEMBLY'=any(allowed)) then raise exception 'Staff sin capacidad de desmontaje.'; end if;
  return new;
end;
$$;

-- Stabilization reconciliation: complete only missing post-commit projections
-- for cancellations already recorded by the canonical cancellation RPC.
insert into public.timeline_events (
  customer_id, project_id, staff_id, orbit_event_id, event_type, title,
  description, actor_id, actor_label, source, action, entity_type, entity_id,
  human_message, correlation_id, reason, created_by
)
select
  p.customer_id,
  c.project_id,
  c.staff_id,
  p.orbit_event_id,
  case when c.initiated_by = 'FOUNDER'
    then 'STAFF_ASSIGNMENT_CANCELLED_BY_FOUNDER'
    else 'STAFF_ASSIGNMENT_CANCELLED' end,
  case when c.initiated_by = 'FOUNDER'
    then 'Founder canceló una asignación'
    else 'Staff canceló una asignación' end,
  concat_ws(' · ', c.reason_category, c.reason_detail),
  c.cancelled_by,
  case when c.initiated_by = 'FOUNDER' then 'Founder' else 'Staff' end,
  case when c.initiated_by = 'FOUNDER' then 'Operations' else 'Staff' end,
  case when c.initiated_by = 'FOUNDER'
    then 'STAFF_ASSIGNMENT_CANCELLED_BY_FOUNDER'
    else 'STAFF_ASSIGNMENT_CANCELLED' end,
  'StaffAssignmentCancellation',
  c.id::text,
  case when c.initiated_by = 'FOUNDER'
    then 'Founder canceló una asignación y el Evento volvió a requerir cobertura.'
    else 'Staff canceló una asignación y el Evento volvió a requerir cobertura.' end,
  'staff-assignment-cancellation:' || c.id,
  concat_ws(' · ', c.reason_category, c.reason_detail),
  c.cancelled_by
from public.staff_assignment_cancellations c
join public.projects p on p.id = c.project_id
where not exists (
  select 1 from public.timeline_events t
  where t.correlation_id = 'staff-assignment-cancellation:' || c.id
);

insert into public.internal_notifications (
  project_id, customer_id, staff_id, notification_type, title, message,
  status, correlation_id, category, priority, action_required, entity_type,
  entity_id, related_href, metadata
)
select
  c.project_id,
  p.customer_id,
  c.staff_id,
  case when c.initiated_by = 'FOUNDER'
    then 'STAFF_ASSIGNMENT_CANCELLED_BY_FOUNDER'
    else 'STAFF_ASSIGNMENT_CANCELLED' end,
  case when c.initiated_by = 'FOUNDER'
    then 'Asignación cancelada por BOOMBOX'
    else 'URGENTE · Staff canceló un Evento' end,
  concat_ws(' · ', c.reason_category, c.reason_detail),
  'UNREAD',
  'staff-assignment-cancellation-alert:' || c.id,
  case when c.initiated_by = 'FOUNDER' then 'STAFF' else 'OPERATIONS' end,
  case when c.initiated_by = 'FOUNDER' then 'HIGH' else 'CRITICAL' end,
  true,
  'StaffAssignmentCancellation',
  c.id::text,
  case when c.initiated_by = 'FOUNDER' then '/staff-portal' else '/projects/' || c.project_id::text end,
  jsonb_build_object('responsibility', c.responsibility, 'reconciled_by', '0268')
from public.staff_assignment_cancellations c
join public.projects p on p.id = c.project_id
where not exists (
  select 1 from public.internal_notifications n
  where n.correlation_id = 'staff-assignment-cancellation-alert:' || c.id
);

-- Historical QA residue: preserve rows, but remove operationally active state
-- from assignments whose project is already archived/cancelled.
update public.assignments a
set status = 'CANCELLED',
    deleted_at = coalesce(a.deleted_at, now()),
    response_at = coalesce(a.response_at, now()),
    reason = coalesce(a.reason, 'Evento archivado/cancelado'),
    updated_at = now()
from public.projects p
where p.id = a.project_id
  and a.deleted_at is null
  and a.status not in ('CANCELLED', 'REJECTED')
  and (p.deleted_at is not null
       or upper(coalesce(p.status, '')) in ('CANCELLED','CANCELED','CLOSED','ARCHIVED'));

-- Prevent recurrence when a project is closed outside the UI flow.
create or replace function public.reconcile_closed_project_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null
     or upper(coalesce(new.status, '')) in ('CANCELLED','CANCELED','CLOSED','ARCHIVED') then
    update public.assignments
    set status = 'CANCELLED',
        deleted_at = coalesce(deleted_at, now()),
        response_at = coalesce(response_at, now()),
        reason = coalesce(reason, 'Evento archivado/cancelado'),
        updated_at = now()
    where project_id = new.id
      and deleted_at is null
      and status not in ('CANCELLED','REJECTED');
  end if;
  return new;
end;
$$;

drop trigger if exists projects_reconcile_closed_assignments on public.projects;
create trigger projects_reconcile_closed_assignments
after update of status, deleted_at on public.projects
for each row execute function public.reconcile_closed_project_assignments();

commit;
