begin;

create or replace function public.update_event_service_schedule(
  p_project_id uuid,
  p_service_start_local text,
  p_service_end_local text,
  p_staff_call_local text default null
)
returns void language plpgsql security invoker set search_path=public as $$
declare
  actor uuid:=auth.uid();
  service_start timestamptz;
  service_end timestamptz;
  staff_call timestamptz;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Administración puede editar horarios operacionales.';
  end if;
  service_start:=p_service_start_local::timestamp at time zone 'America/Santiago';
  service_end:=p_service_end_local::timestamp at time zone 'America/Santiago';
  if service_end<=service_start then service_end:=service_end+interval '1 day'; end if;
  if service_end-service_start>interval '24 hours' then
    raise exception 'El servicio no puede superar 24 horas.';
  end if;
  staff_call:=case when nullif(p_staff_call_local,'') is null then null else p_staff_call_local::timestamp at time zone 'America/Santiago' end;
  if staff_call is not null and (staff_call>service_start or staff_call<service_start-interval '24 hours') then
    raise exception 'La citación Staff debe estar dentro de las 24 horas previas al inicio del servicio.';
  end if;
  insert into public.project_operational_contracts(project_id,service_start_at,service_end_at,staff_arrival_at,prepared_by,updated_by)
  values(p_project_id,service_start,service_end,staff_call,actor,actor)
  on conflict(project_id) do update set service_start_at=excluded.service_start_at,service_end_at=excluded.service_end_at,staff_arrival_at=excluded.staff_arrival_at,updated_by=actor,updated_at=now();
  update public.assignments set
    staff_call_at=staff_call,
    staff_call_source='DERIVED',
    updated_by=actor
  where project_id=p_project_id and deleted_at is null and coalesce(staff_call_source,'DERIVED')='DERIVED';
end $$;

revoke all on function public.update_event_service_schedule(uuid,text,text,text) from public,anon;
grant execute on function public.update_event_service_schedule(uuid,text,text,text) to authenticated;

create temporary table event_schedule_repaired_0182 on commit drop as
with invalid as (
  select c.id,c.project_id,c.service_start_at,
    ((c.service_start_at at time zone 'America/Santiago')::date + (c.staff_arrival_at at time zone 'America/Santiago')::time) at time zone 'America/Santiago' repaired_call
  from public.project_operational_contracts c
  join public.projects p on p.id=c.project_id
  where p.deleted_at is null and c.service_start_at is not null and c.staff_arrival_at is not null
    and (c.staff_arrival_at>c.service_start_at or c.staff_arrival_at<c.service_start_at-interval '24 hours')
)
select id,project_id,case when repaired_call>service_start_at then repaired_call-interval '1 day' else repaired_call end normalized_call from invalid;

update public.project_operational_contracts c set staff_arrival_at=r.normalized_call,updated_at=now()
from event_schedule_repaired_0182 r where c.id=r.id;

update public.calendar_sync cs set status='UPDATE_REQUIRED',last_error=jsonb_build_object('message','Horario operacional reparado; sincronización pendiente.'),updated_at=now()
from event_schedule_repaired_0182 r where cs.project_id=r.project_id and cs.external_event_id is not null;

insert into public.timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_label,source,action,entity_type,entity_id,human_message,correlation_id)
select p.customer_id,r.project_id,p.orbit_event_id,'EVENT_SCHEDULE_REPAIRED','Horario operacional reparado','ORBIT normalizó una citación fuera de la ventana del servicio.','ORBIT','System','EVENT_SCHEDULE_REPAIRED','Project',r.project_id,'Horario operacional actual reparado sin alterar documentos históricos.','event-schedule-repair:0182:'||r.project_id
from event_schedule_repaired_0182 r join public.projects p on p.id=r.project_id
on conflict(correlation_id,action,entity_type,entity_id) do nothing;

commit;
