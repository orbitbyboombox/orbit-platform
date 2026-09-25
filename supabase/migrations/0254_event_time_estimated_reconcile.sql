-- V2.1 Phase A: replace the staging TBD contract with a real, editable
-- estimated time. This is a forward-only reconciliation for TEST first.
begin;

update public.projects
set event_time = coalesce(event_time, '22:00'::time),
    event_time_mode = case when event_time_mode = 'CONFIRMED' then 'CONFIRMED' else 'ESTIMATED' end,
    event_time_confirmation_deadline = event_date - 7
where event_time is null or event_time_mode is null or event_time_mode = 'TBD';

update public.projects
set event_time = coalesce(event_time, '22:00'::time),
    event_time_mode = coalesce(nullif(event_time_mode, ''), 'ESTIMATED'),
    event_time_confirmation_deadline = event_date - 7
where event_time_mode not in ('ESTIMATED', 'CONFIRMED') or event_time is null;

alter table public.projects
  alter column event_time set default '22:00'::time,
  alter column event_time set not null,
  alter column event_time_mode set default 'ESTIMATED';

alter table public.projects drop constraint if exists projects_event_time_mode_check;
alter table public.projects add constraint projects_event_time_mode_check
  check (event_time_mode in ('ESTIMATED', 'CONFIRMED') and event_time is not null);

drop index if exists public.projects_pending_event_time_idx;
create index if not exists projects_event_time_confirmation_idx
  on public.projects(event_time_confirmation_deadline,event_date)
  where deleted_at is null and event_time_mode='ESTIMATED';

create or replace function public.normalize_project_event_time_contract()
returns trigger language plpgsql set search_path=public as $$
begin
  new.event_time := coalesce(new.event_time, '22:00'::time);
  if new.event_time_mode is null or new.event_time_mode not in ('ESTIMATED','CONFIRMED') then
    new.event_time_mode := 'ESTIMATED';
  end if;
  new.event_time_window := coalesce(nullif(upper(new.event_time_window),''), 'UNKNOWN');
  new.event_time_confirmation_deadline := new.event_date - 7;
  return new;
end $$;

create or replace function public.event_operational_window(p_project_id uuid)
returns table(window_start timestamptz,window_end timestamptz)
language sql stable security definer set search_path=public as $$
  with source as(
    select p.event_date,p.event_time,p.event_time_mode,c.staff_arrival_at,c.assembly_start_at,c.event_start_at,c.service_start_at,
      c.service_end_at,c.disassembly_start_at,c.operational_end_at,
      coalesce((select max(duration_hours) from public.project_services where project_id=p.id),0) duration_hours
    from public.projects p left join public.project_operational_contracts c on c.project_id=p.id
    where p.id=p_project_id and p.deleted_at is null and p.event_time is not null
  ), normalized as(
    select coalesce(assembly_start_at,staff_arrival_at,event_start_at,service_start_at,
      (event_date+event_time) at time zone 'America/Santiago') start_at,
      service_end_at,disassembly_start_at,operational_end_at,duration_hours
    from source
  )
  select start_at,coalesce(operational_end_at,disassembly_start_at,service_end_at,
    case when start_at is not null and duration_hours>0 then start_at+make_interval(mins=>(duration_hours*60)::integer) end)
  from normalized
$$;

create or replace function public.preflight_reservation_capacity(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare mode text; result jsonb;
begin
  select event_time_mode into mode from public.projects where id=p_project_id and deleted_at is null;
  if mode is null then
    return jsonb_build_object('status','REVIEW_REQUIRED','reasonCode','PROJECT_NOT_FOUND','humanSafeReason','No fue posible validar el evento.');
  end if;
  result := public.preflight_reservation_capacity_confirmed(p_project_id);
  if mode = 'ESTIMATED' and result->>'status' = 'AVAILABLE' then
    return result || jsonb_build_object('status','CAPACITY_PRELIMINARY','capacityStatus','CAPACITY_PRELIMINARY','confirmationRequired',true,'estimated',true);
  end if;
  return result || jsonb_build_object('capacityStatus',case when mode='CONFIRMED' and result->>'status'='AVAILABLE' then 'CAPACITY_CONFIRMED' else result->>'status' end,'confirmationRequired',mode='ESTIMATED','estimated',mode='ESTIMATED');
end $$;
revoke all on function public.preflight_reservation_capacity(uuid) from public,anon;
grant execute on function public.preflight_reservation_capacity(uuid) to authenticated,service_role;

create or replace function public._preflight_draft_capacity_core(
  p_service_codes text[], p_event_type text, p_event_date date,
  p_service_start timestamptz, p_service_end timestamptz,
  p_address text default '', p_city text default '', p_shell text default null
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare result jsonb;
begin
  if p_event_date is not null and (p_service_start is null or p_service_end is null) then
    return jsonb_build_object('status','CAPACITY_PRELIMINARY','capacityStatus','CAPACITY_PRELIMINARY','reasonCode','EVENT_TIME_REQUIRED','confirmationRequired',true,'humanSafeReason','La disponibilidad preliminar requiere un horario estimado.');
  end if;
  result := public._preflight_draft_capacity_confirmed(p_service_codes,p_event_type,p_event_date,p_service_start,p_service_end,p_address,p_city,p_shell);
  if result->>'status' = 'AVAILABLE' then
    return result || jsonb_build_object('status','CAPACITY_PRELIMINARY','capacityStatus','CAPACITY_PRELIMINARY','confirmationRequired',true,'estimated',true);
  end if;
  return result;
end $$;

commit;
