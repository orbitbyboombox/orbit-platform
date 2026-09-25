-- V2.1 Phase A: production-safe event-time contract.
-- This is intentionally independent of the historical TEST-only 0253/0254
-- migrations. It preserves the four already-archived NULL-time fixtures.
begin;

alter table public.projects
  add column if not exists event_time_mode text,
  add column if not exists event_time_window text,
  add column if not exists event_time_confirmation_deadline date;

-- Existing real times, including 00:00, are confirmed. Archived legacy rows
-- with no historical time remain NULL and are not fabricated as 22:00.
update public.projects
set event_time_mode = case when event_time is null then null else 'CONFIRMED' end,
    event_time_window = coalesce(nullif(upper(operations->>'eventTimeWindow'), ''), 'UNKNOWN'),
    event_time_confirmation_deadline = event_date - 7
where event_time_mode is null;

update public.projects
set event_time_confirmation_deadline = event_date - 7
where event_time_confirmation_deadline is distinct from event_date - 7;

alter table public.projects
  alter column event_time set default '22:00'::time,
  alter column event_time_mode set default 'ESTIMATED',
  alter column event_time_window set default 'UNKNOWN';

alter table public.projects drop constraint if exists projects_event_time_mode_check;
alter table public.projects add constraint projects_event_time_mode_check
check (
  (event_time is not null and event_time_mode in ('ESTIMATED', 'CONFIRMED'))
  or
  (
    event_time is null
    and event_time_mode is null
    and status = 'ARCHIVED'
    and deleted_at is not null
  )
);

alter table public.projects drop constraint if exists projects_event_time_window_check;
alter table public.projects add constraint projects_event_time_window_check
check (event_time_window is null or event_time_window in ('MORNING', 'AFTERNOON', 'EVENING', 'UNKNOWN'));

create index if not exists projects_event_time_confirmation_idx
  on public.projects(event_time_confirmation_deadline, event_date)
  where deleted_at is null and event_time_mode = 'ESTIMATED';

create or replace function public.normalize_project_event_time_contract()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.event_time is null then
    -- Only an already-deleted archived legacy row may remain NULL.
    if new.status = 'ARCHIVED' and new.deleted_at is not null then
      new.event_time_mode := null;
    else
      new.event_time_mode := coalesce(new.event_time_mode, 'ESTIMATED');
    end if;
  elsif new.event_time_mode is null then
    -- New rows use the estimated business default; existing confirmed rows
    -- retain CONFIRMED because a non-null mode is never overwritten here.
    new.event_time_mode := 'ESTIMATED';
  end if;

  new.event_time_window := coalesce(nullif(upper(new.event_time_window), ''), 'UNKNOWN');
  new.event_time_confirmation_deadline := new.event_date - 7;
  return new;
end;
$$;

drop trigger if exists projects_event_time_contract on public.projects;
create trigger projects_event_time_contract
before insert or update of event_date, event_time, event_time_mode, event_time_window, status, deleted_at
on public.projects
for each row execute function public.normalize_project_event_time_contract();

-- Preserve the certified Production engine under a confirmed name and expose
-- an explicit mode-aware wrapper. No Calendar or operational rows are written.
do $$
begin
  if to_regprocedure('public.preflight_reservation_capacity_legacy(uuid)') is null then
    alter function public.preflight_reservation_capacity(uuid)
      rename to preflight_reservation_capacity_legacy;
  end if;
end;
$$;

create or replace function public.preflight_reservation_capacity_confirmed(p_project_id uuid)
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select public.preflight_reservation_capacity_legacy(p_project_id)
$$;

create or replace function public.preflight_reservation_capacity(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  mode text;
  event_time_value time;
  result jsonb;
begin
  select p.event_time_mode, p.event_time
    into mode, event_time_value
    from public.projects p
   where p.id = p_project_id and p.deleted_at is null;

  if event_time_value is null then
    return jsonb_build_object(
      'status', 'CAPACITY_PENDING_TIME',
      'capacityMode', 'CAPACITY_PRELIMINARY',
      'reasonCode', 'EVENT_TIME_PENDING'
    );
  end if;

  result := public.preflight_reservation_capacity_legacy(p_project_id);
  return result || jsonb_build_object(
    'capacityMode', case when mode = 'CONFIRMED' then 'CAPACITY_CONFIRMED' else 'CAPACITY_PRELIMINARY' end
  );
end;
$$;

revoke all on function public.preflight_reservation_capacity(uuid) from public, anon;
grant execute on function public.preflight_reservation_capacity(uuid) to authenticated, service_role;
revoke all on function public.preflight_reservation_capacity_confirmed(uuid) from public, anon, authenticated;
grant execute on function public.preflight_reservation_capacity_confirmed(uuid) to service_role;

create or replace function public.confirm_project_event_time(
  p_project_id uuid,
  p_event_time time
) returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  actor uuid := auth.uid();
  project_row public.projects%rowtype;
  previous_time time;
  capacity_result jsonb;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede confirmar el horario.';
  end if;
  if p_event_time is null then
    raise exception 'El horario exacto es obligatorio.';
  end if;

  select * into project_row
    from public.projects
   where id = p_project_id and deleted_at is null
   for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  previous_time := project_row.event_time;

  update public.projects
     set event_time = p_event_time,
         event_time_mode = 'CONFIRMED',
         event_time_confirmation_deadline = event_date - 7,
         updated_by = actor,
         updated_at = now()
   where id = p_project_id;

  capacity_result := public.preflight_reservation_capacity_confirmed(p_project_id);
  if coalesce(capacity_result->>'status', '') not in ('AVAILABLE', 'CAPACITY_CONFIRMED') then
    raise exception using errcode = 'P0001', message = 'CAPACITY_CONFLICT', detail = capacity_result::text;
  end if;

  perform public.sync_event_operational_requirements(p_project_id, actor);
  perform public.recalculate_event_resource_assignments(p_project_id, actor);

  insert into public.timeline_events(
    customer_id, project_id, orbit_event_id, actor_id, actor_label, source, action,
    entity_type, entity_id, event_type, title, description, human_message,
    correlation_id, previous_state, new_state, created_by
  ) values (
    project_row.customer_id, project_row.id, project_row.orbit_event_id, actor,
    'Founder', 'Administrator', 'EVENT_TIME_CONFIRMED', 'Project', project_row.id,
    'EVENT_TIME_CONFIRMED', 'Horario confirmado',
    'El Founder confirmó el horario del evento.',
    format('Horario actualizado de %s a %s.', to_char(previous_time, 'HH24:MI'), to_char(p_event_time, 'HH24:MI')),
    'event-time-confirmed:' || project_row.id || ':' || extract(epoch from clock_timestamp())::bigint,
    jsonb_build_object('eventTime', to_char(previous_time, 'HH24:MI'), 'eventTimeMode', project_row.event_time_mode),
    jsonb_build_object('eventTime', to_char(p_event_time, 'HH24:MI'), 'eventTimeMode', 'CONFIRMED'), actor
  );

  return jsonb_build_object(
    'projectId', p_project_id,
    'previousEstimatedTime', to_char(previous_time, 'HH24:MI'),
    'confirmedTime', to_char(p_event_time, 'HH24:MI'),
    'eventTimeMode', 'CONFIRMED',
    'capacityStatus', 'CAPACITY_CONFIRMED',
    'capacity', capacity_result,
    'confirmedAt', now(),
    'actorId', actor
  );
end;
$$;

revoke all on function public.confirm_project_event_time(uuid, time) from public, anon;
grant execute on function public.confirm_project_event_time(uuid, time) to authenticated;

drop view if exists public.staff_available_event_projection;
create view public.staff_available_event_projection
with (security_invoker = true)
as
select
  p.id as project_id,
  p.orbit_event_id,
  p.project_type,
  p.event_date,
  p.event_time,
  p.event_time_mode,
  p.city,
  coalesce(c.access_instructions, '') as access_instructions,
  coalesce(jsonb_agg(jsonb_build_object(
    'code', ps.service_code,
    'durationHours', ps.duration_hours,
    'quantity', ps.quantity
  )) filter (where ps.id is not null), '[]'::jsonb) as services
from public.staff_event_publications publication
join public.projects p on p.id = publication.project_id and p.deleted_at is null
left join public.project_operational_contracts c on c.project_id = p.id
left join public.project_services ps on ps.project_id = p.id
where publication.published
group by p.id, c.access_instructions;

revoke all on public.staff_available_event_projection from public, anon, authenticated;
grant select on public.staff_available_event_projection to service_role;

commit;
