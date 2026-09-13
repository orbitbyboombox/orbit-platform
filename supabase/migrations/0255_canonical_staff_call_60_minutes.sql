begin;

-- Canonical staff-call metadata. Existing values are normalized without deleting history.
alter table public.assignments drop constraint if exists assignments_staff_call_source_check;
update public.assignments set staff_call_source='FOUNDER_OVERRIDE' where staff_call_source='MANUAL_OVERRIDE';
update public.assignments set staff_call_source='DEFAULT_60_MIN' where staff_call_source='DERIVED';
alter table public.assignments add constraint assignments_staff_call_source_check
  check (staff_call_source is null or staff_call_source in ('DEFAULT_60_MIN','FOUNDER_OVERRIDE','LEGACY'));

create or replace function public.calculate_staff_call_at(p_service_start_at timestamptz)
returns timestamptz
language sql
immutable
set search_path=public
as $$ select p_service_start_at - interval '60 minutes' $$;

comment on function public.calculate_staff_call_at(timestamptz) is
  'Canonical staff call: service start minus 60 minutes in the event timezone.';

create or replace function public.update_event_service_schedule(
  p_project_id uuid,
  p_service_start_local text,
  p_service_end_local text,
  p_staff_call_local text default null
) returns void language plpgsql security invoker set search_path=public as $$
declare
  actor uuid:=auth.uid();
  service_start timestamptz;
  service_end timestamptz;
  staff_call timestamptz;
  source text;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Administración puede editar horarios operacionales.'; end if;
  service_start:=p_service_start_local::timestamp at time zone 'America/Santiago';
  service_end:=p_service_end_local::timestamp at time zone 'America/Santiago';
  if service_end<=service_start then service_end:=service_end+interval '1 day'; end if;
  if service_end-service_start>interval '24 hours' then raise exception 'El servicio no puede superar 24 horas.'; end if;
  source:=case when nullif(p_staff_call_local,'') is null then 'DEFAULT_60_MIN' else 'FOUNDER_OVERRIDE' end;
  staff_call:=case when source='DEFAULT_60_MIN' then public.calculate_staff_call_at(service_start) else p_staff_call_local::timestamp at time zone 'America/Santiago' end;
  if staff_call>service_start or staff_call<service_start-interval '24 hours' then raise exception 'La citación Staff debe estar dentro de las 24 horas previas al inicio del servicio.'; end if;
  insert into public.project_operational_contracts(project_id,service_start_at,service_end_at,staff_arrival_at,prepared_by,updated_by)
  values(p_project_id,service_start,service_end,staff_call,actor,actor)
  on conflict(project_id) do update set service_start_at=excluded.service_start_at,service_end_at=excluded.service_end_at,staff_arrival_at=excluded.staff_arrival_at,updated_by=actor,updated_at=now();
  update public.assignments set staff_call_at=staff_call,staff_call_source=source,updated_by=actor
  where project_id=p_project_id and deleted_at is null and coalesce(staff_call_source,'LEGACY')<>'FOUNDER_OVERRIDE';
end $$;

revoke all on function public.update_event_service_schedule(uuid,text,text,text) from public,anon;
grant execute on function public.update_event_service_schedule(uuid,text,text,text) to authenticated;

-- Normalize future operational assignments. Explicit Founder overrides are preserved.
with future_schedule as (
  select p.id as project_id,
         coalesce(c.service_start_at, ((p.event_date + coalesce(p.event_time,'00:00'::time))::timestamp at time zone 'America/Santiago')) as service_start_at
  from public.projects p
  left join public.project_operational_contracts c on c.project_id=p.id
  where p.deleted_at is null
    and p.event_date >= (now() at time zone 'America/Santiago')::date
)
update public.assignments a
set staff_call_at=public.calculate_staff_call_at(s.service_start_at),
    staff_call_source='DEFAULT_60_MIN',
    updated_at=now()
from future_schedule s
where a.project_id=s.project_id
  and a.deleted_at is null
  and a.status not in ('CANCELLED','REJECTED')
  and coalesce(a.staff_call_source,'LEGACY') <> 'FOUNDER_OVERRIDE';

revoke all on function public.calculate_staff_call_at(timestamptz) from public, anon;
grant execute on function public.calculate_staff_call_at(timestamptz) to authenticated;

commit;
