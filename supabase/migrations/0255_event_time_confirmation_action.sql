-- V2.1 Phase A.2: atomic Founder/Admin event-time confirmation.
begin;

create or replace function public.confirm_project_event_time(
  p_project_id uuid,
  p_event_time time
) returns jsonb
language plpgsql security invoker set search_path=public,extensions as $$
declare
  actor uuid := auth.uid();
  project_row public.projects%rowtype;
  previous_time time;
  capacity_result jsonb;
  readiness_result jsonb := '{}'::jsonb;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede confirmar el horario.';
  end if;
  if p_event_time is null then
    raise exception 'El horario exacto es obligatorio.';
  end if;

  select * into project_row from public.projects
    where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  previous_time := project_row.event_time;

  update public.projects set event_time=p_event_time,event_time_mode='CONFIRMED',
    event_time_confirmation_deadline=event_date-7,updated_by=actor,updated_at=now()
    where id=p_project_id;

  capacity_result := public.preflight_reservation_capacity_confirmed(p_project_id);
  if coalesce(capacity_result->>'status','') not in ('AVAILABLE','CAPACITY_CONFIRMED') then
    raise exception using
      errcode='P0001',
      message='CAPACITY_CONFLICT',
      detail=capacity_result::text;
  end if;

  perform public.sync_event_operational_requirements(p_project_id,actor);
  perform public.recalculate_event_resource_assignments(p_project_id,actor);
  if exists(select 1 from public.project_operational_contracts where project_id=p_project_id) then
    readiness_result := public.refresh_event_operational_readiness(p_project_id,actor);
  end if;

  insert into public.timeline_events(
    customer_id,project_id,orbit_event_id,actor_id,actor_label,source,action,
    entity_type,entity_id,event_type,title,description,human_message,
    correlation_id,previous_state,new_state,created_by
  ) values(
    project_row.customer_id,project_row.id,project_row.orbit_event_id,actor,
    'Founder','Administrator','EVENT_TIME_CONFIRMED','Project',project_row.id,
    'EVENT_TIME_CONFIRMED','Horario confirmado','El Founder confirmó el horario del evento.',
    format('Horario actualizado de %s a %s.',to_char(previous_time,'HH24:MI'),to_char(p_event_time,'HH24:MI')),
    'event-time-confirmed:'||project_row.id||':'||extract(epoch from clock_timestamp())::bigint,
    jsonb_build_object('eventTime',to_char(previous_time,'HH24:MI'),'eventTimeMode','ESTIMATED'),
    jsonb_build_object('eventTime',to_char(p_event_time,'HH24:MI'),'eventTimeMode','CONFIRMED'),actor
  );

  return jsonb_build_object(
    'projectId',p_project_id,'previousEstimatedTime',to_char(previous_time,'HH24:MI'),
    'confirmedTime',to_char(p_event_time,'HH24:MI'),'eventTimeMode','CONFIRMED',
    'capacityStatus','CAPACITY_CONFIRMED','capacity',capacity_result,
    'readiness',readiness_result,'confirmedAt',now(),'actorId',actor
  );
end $$;

revoke all on function public.confirm_project_event_time(uuid,time) from public,anon;
grant execute on function public.confirm_project_event_time(uuid,time) to authenticated;

commit;
