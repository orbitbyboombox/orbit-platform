begin;

-- One source of truth for every active assignment: service start minus 60 minutes.
-- Confirmed project times win; unconfirmed schedules use their operational contract.
create or replace function public.canonical_staff_call_at_for_project(p_project_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with source as (
    select p.event_date,
           p.event_time,
           p.event_time_mode,
           p.operations,
           c.service_start_at,
           case
             when upper(coalesce(p.event_time_mode, '')) = 'CONFIRMED' and p.event_time is not null
               then (p.event_date + p.event_time) at time zone 'America/Santiago'
             else coalesce(
               c.service_start_at,
               nullif(p.operations->>'service_start_at', '')::timestamptz,
               case when p.event_time is not null
                 then (p.event_date + p.event_time) at time zone 'America/Santiago'
               end
             )
           end as canonical_start
    from public.projects p
    left join public.project_operational_contracts c on c.project_id = p.id
    where p.id = p_project_id and p.deleted_at is null
  )
  select canonical_start - interval '60 minutes' from source where canonical_start is not null
$$;

create or replace function public.calculate_staff_call_at(p_service_start_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = public
as $$ select p_service_start_at - interval '60 minutes' $$;

comment on function public.calculate_staff_call_at(timestamptz) is
  'Canonical Staff call: exactly 60 elapsed minutes before service start.';

-- Ignore legacy caller-supplied citations in the schedule RPC. Its signature stays
-- compatible with deployed clients; the service window itself remains unchanged.
create or replace function public.update_event_service_schedule(
  p_project_id uuid,
  p_service_start_local text,
  p_service_end_local text,
  p_staff_call_local text default null
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  service_start timestamptz;
  service_end timestamptz;
  staff_call timestamptz;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Administración puede editar horarios operacionales.';
  end if;
  service_start := p_service_start_local::timestamp at time zone 'America/Santiago';
  service_end := p_service_end_local::timestamp at time zone 'America/Santiago';
  if service_end <= service_start then service_end := service_end + interval '1 day'; end if;
  if service_end - service_start > interval '24 hours' then
    raise exception 'El servicio no puede superar 24 horas.';
  end if;
  staff_call := public.calculate_staff_call_at(service_start);
  insert into public.project_operational_contracts(
    project_id, service_start_at, service_end_at, staff_arrival_at, prepared_by, updated_by
  ) values (p_project_id, service_start, service_end, staff_call, actor, actor)
  on conflict (project_id) do update set
    service_start_at = excluded.service_start_at,
    service_end_at = excluded.service_end_at,
    staff_arrival_at = excluded.staff_arrival_at,
    updated_by = actor,
    updated_at = now();
  update public.assignments
  set staff_call_at = staff_call,
      staff_call_source = 'DEFAULT_60_MINUTES',
      arrival_time = (staff_call at time zone 'America/Santiago')::time,
      updated_by = actor,
      updated_at = now()
  where project_id = p_project_id and deleted_at is null and status not in ('CANCELLED', 'REJECTED');
end $$;

create or replace function public.enforce_assignment_staff_call_60_minutes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  call_at timestamptz;
  event_date date;
begin
  if new.deleted_at is not null or new.status in ('CANCELLED', 'REJECTED') then return new; end if;
  select p.event_date into event_date from public.projects p
  where p.id = new.project_id and p.deleted_at is null;
  if event_date is null or event_date < (now() at time zone 'America/Santiago')::date then return new; end if;
  call_at := public.canonical_staff_call_at_for_project(new.project_id);
  if call_at is null then raise exception 'No existe un inicio canónico de servicio para calcular la citación Staff.'; end if;
  new.staff_call_at := call_at;
  new.staff_call_source := 'DEFAULT_60_MINUTES';
  new.arrival_time := (call_at at time zone 'America/Santiago')::time;
  return new;
end $$;

drop trigger if exists assignments_enforce_staff_call_60_minutes on public.assignments;
create trigger assignments_enforce_staff_call_60_minutes
before insert or update of project_id, assignment_type, status, staff_call_at, staff_call_source
on public.assignments
for each row execute function public.enforce_assignment_staff_call_60_minutes();

create or replace function public.refresh_project_staff_calls_60_minutes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  call_at timestamptz;
begin
  if new.deleted_at is not null then return new; end if;
  if new.event_date < (now() at time zone 'America/Santiago')::date then return new; end if;
  call_at := public.canonical_staff_call_at_for_project(new.id);
  if call_at is null then return new; end if;
  update public.project_operational_contracts
  set staff_arrival_at = call_at, updated_at = now()
  where project_id = new.id and staff_arrival_at is distinct from call_at;
  update public.assignments
  set staff_call_at = call_at,
      staff_call_source = 'DEFAULT_60_MINUTES',
      arrival_time = (call_at at time zone 'America/Santiago')::time,
      updated_at = now()
  where project_id = new.id and deleted_at is null
    and status not in ('CANCELLED', 'REJECTED')
    and (staff_call_at is distinct from call_at or staff_call_source is distinct from 'DEFAULT_60_MINUTES');
  return new;
end $$;

drop trigger if exists projects_refresh_staff_calls_60_minutes on public.projects;
create trigger projects_refresh_staff_calls_60_minutes
after update of event_date, event_time, event_time_mode, operations
on public.projects
for each row execute function public.refresh_project_staff_calls_60_minutes();

-- Preserve an audit trail for every changed future citation before the backfill.
with future_projects as (
  select p.id, p.orbit_event_id, public.canonical_staff_call_at_for_project(p.id) as call_at
  from public.projects p
  where p.deleted_at is null
    and p.event_date >= (now() at time zone 'America/Santiago')::date
    and p.status not in ('CANCELLED', 'CANCELED', 'ARCHIVED', 'DELETED')
)
insert into public.timeline_events(
  project_id, orbit_event_id, event_type, title, description, actor_label, source,
  action, entity_type, entity_id, human_message, correlation_id
)
select p.id, p.orbit_event_id, 'STAFF_CALL_RECALCULATED', 'Citación Staff normalizada',
       'Citación anterior: ' || coalesce(a.staff_call_at::text, 'sin dato') ||
       ' (' || coalesce(a.staff_call_source, 'sin origen') || '); citación canónica: ' ||
       fp.call_at::text || ' (exactamente 60 minutos antes del servicio).',
       'ORBIT System', 'Staff scheduling', 'STAFF_CALL_RECALCULATED', 'Assignment', a.id::text,
       'Se recalculó automáticamente la citación desde el inicio canónico del servicio; no se alteró el horario comercial.',
       'staff-call-60:0259:assignment:' || a.id::text
from public.assignments a
join future_projects fp on fp.id = a.project_id
join public.projects p on p.id = a.project_id
where fp.call_at is not null and a.deleted_at is null
  and a.status not in ('CANCELLED', 'REJECTED')
  and (a.staff_call_at is distinct from fp.call_at
       or a.staff_call_source is distinct from 'DEFAULT_60_MINUTES'
       or a.arrival_time is distinct from (fp.call_at at time zone 'America/Santiago')::time)
on conflict(correlation_id, action, entity_type, entity_id) do nothing;

insert into public.timeline_events(
  project_id, orbit_event_id, event_type, title, description, actor_label, source,
  action, entity_type, entity_id, human_message, correlation_id
)
select p.id, p.orbit_event_id, 'STAFF_CALL_RECALCULATED', 'Citación Staff normalizada',
       'Citación de contrato anterior: ' || coalesce(c.staff_arrival_at::text, 'sin dato') ||
       '; citación canónica: ' || public.canonical_staff_call_at_for_project(p.id)::text ||
       ' (exactamente 60 minutos antes del servicio).',
       'ORBIT System', 'Staff scheduling', 'STAFF_CALL_RECALCULATED', 'OperationalContract', c.project_id::text,
       'Se recalculó la citación del contrato operacional; el inicio, término y duración del servicio no se alteraron.',
       'staff-call-60:0259:contract:' || c.project_id::text
from public.project_operational_contracts c
join public.projects p on p.id = c.project_id
where p.deleted_at is null
  and p.event_date >= (now() at time zone 'America/Santiago')::date
  and p.status not in ('CANCELLED', 'CANCELED', 'ARCHIVED', 'DELETED')
  and public.canonical_staff_call_at_for_project(p.id) is not null
  and c.staff_arrival_at is distinct from public.canonical_staff_call_at_for_project(p.id)
on conflict(correlation_id, action, entity_type, entity_id) do nothing;

-- Backfill only active, non-historical assignments. Historical records remain intact.
with future_projects as (
  select p.id, public.canonical_staff_call_at_for_project(p.id) as call_at
  from public.projects p
  where p.deleted_at is null
    and p.event_date >= (now() at time zone 'America/Santiago')::date
    and p.status not in ('CANCELLED', 'CANCELED', 'ARCHIVED', 'DELETED')
)
update public.assignments a
set staff_call_at = fp.call_at,
    staff_call_source = 'DEFAULT_60_MINUTES',
    arrival_time = (fp.call_at at time zone 'America/Santiago')::time,
    updated_at = now()
from future_projects fp
where a.project_id = fp.id and fp.call_at is not null
  and a.deleted_at is null and a.status not in ('CANCELLED', 'REJECTED')
  and (a.staff_call_at is distinct from fp.call_at or a.staff_call_source is distinct from 'DEFAULT_60_MINUTES'
       or a.arrival_time is distinct from (fp.call_at at time zone 'America/Santiago')::time);

update public.project_operational_contracts c
set staff_arrival_at = public.canonical_staff_call_at_for_project(c.project_id), updated_at = now()
from public.projects p
where p.id = c.project_id and p.deleted_at is null
  and p.event_date >= (now() at time zone 'America/Santiago')::date
  and p.status not in ('CANCELLED', 'CANCELED', 'ARCHIVED', 'DELETED')
  and public.canonical_staff_call_at_for_project(c.project_id) is not null
  and c.staff_arrival_at is distinct from public.canonical_staff_call_at_for_project(c.project_id);

revoke all on function public.canonical_staff_call_at_for_project(uuid) from public, anon;
revoke all on function public.enforce_assignment_staff_call_60_minutes() from public, anon;
revoke all on function public.refresh_project_staff_calls_60_minutes() from public, anon;
revoke all on function public.calculate_staff_call_at(timestamptz) from public, anon;
grant execute on function public.calculate_staff_call_at(timestamptz) to authenticated;
grant execute on function public.update_event_service_schedule(uuid, text, text, text) to authenticated;

commit;
