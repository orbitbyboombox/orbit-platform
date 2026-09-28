begin;

-- The confirmed preflight wrapper is security definer and is called by the
-- authenticated, security-invoker confirmation RPC. The wrapper must be
-- callable by authenticated users; its underlying checks remain protected.
grant execute on function public.preflight_reservation_capacity_confirmed(uuid) to authenticated;

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
  stage text := 'EVENT_TIME_UPDATE';
  error_code text;
  error_message text;
  error_detail text;
  error_hint text;
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

  raise log 'EVENT_TIME_UPDATE project_id=% requested_time=%', p_project_id, to_char(p_event_time, 'HH24:MI');
  update public.projects
     set event_time = p_event_time,
         event_time_mode = 'CONFIRMED',
         event_time_confirmation_deadline = event_date - 7,
         updated_by = actor,
         updated_at = now()
   where id = p_project_id;

  stage := 'EVENT_TIME_CAPACITY';
  raise log 'EVENT_TIME_CAPACITY project_id=% requested_time=%', p_project_id, to_char(p_event_time, 'HH24:MI');
  capacity_result := public.preflight_reservation_capacity_confirmed(p_project_id);
  if coalesce(capacity_result->>'status', '') not in ('AVAILABLE', 'CAPACITY_CONFIRMED') then
    raise exception using errcode = 'P0001', message = 'CAPACITY_CONFLICT', detail = capacity_result::text;
  end if;

  stage := 'EVENT_TIME_REQUIREMENTS';
  raise log 'EVENT_TIME_REQUIREMENTS project_id=% requested_time=%', p_project_id, to_char(p_event_time, 'HH24:MI');
  perform public.sync_event_operational_requirements(p_project_id, actor);

  stage := 'EVENT_TIME_RESOURCE_ASSIGNMENTS';
  raise log 'EVENT_TIME_RESOURCE_ASSIGNMENTS project_id=% requested_time=%', p_project_id, to_char(p_event_time, 'HH24:MI');
  perform public.recalculate_event_resource_assignments(p_project_id, actor);

  stage := 'EVENT_TIME_TIMELINE';
  raise log 'EVENT_TIME_TIMELINE project_id=% requested_time=%', p_project_id, to_char(p_event_time, 'HH24:MI');
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

  stage := 'EVENT_TIME_RETURN';
  raise log 'EVENT_TIME_RETURN project_id=% requested_time=%', p_project_id, to_char(p_event_time, 'HH24:MI');
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
exception when others then
  get stacked diagnostics
    error_code = returned_sqlstate,
    error_message = message_text,
    error_detail = pg_exception_detail,
    error_hint = pg_exception_hint;
  raise log 'EVENT_TIME_FAILURE stage=% project_id=% requested_time=% code=% message=% detail=% hint=%',
    stage, p_project_id, to_char(p_event_time, 'HH24:MI'), error_code, error_message, error_detail, error_hint;
  raise;
end;
$$;

revoke all on function public.confirm_project_event_time(uuid, time) from public, anon;
grant execute on function public.confirm_project_event_time(uuid, time) to authenticated;

commit;
