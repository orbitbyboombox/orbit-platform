begin;

-- Finalizes only the authenticated Staff member's OPERATOR block assignment.
-- It intentionally does not touch the event, box, paper snapshot, Master stock,
-- payments, or any other assignment.
create or replace function public.finalize_staff_operational_turn(
  p_project_id uuid,
  p_assignment_id uuid,
  p_block_id uuid,
  p_staff_id uuid,
  p_portal_session_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  actor_profile_id uuid;
  assignment_row public.assignments%rowtype;
begin
  select a.resolved_staff_id,a.profile_id
    into p_staff_id,actor_profile_id
  from public.resolve_phase_c_staff_portal_actor(p_staff_id,p_portal_session_id) a;

  if nullif(trim(p_idempotency_key),'') is null then
    raise exception 'Solicitud de finalización inválida.';
  end if;

  select * into assignment_row
  from public.assignments
  where id=p_assignment_id
    and project_id=p_project_id
    and staff_id=p_staff_id
    and assignment_type='OPERATOR'
    and block_id=p_block_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'El turno no pertenece a tu asignación activa.';
  end if;

  if assignment_row.status='COMPLETED' then
    return jsonb_build_object(
      'assignment_id',assignment_row.id,
      'block_id',assignment_row.block_id,
      'status','COMPLETED',
      'duplicate',true,
      'completed_at',assignment_row.response_at
    );
  end if;

  if assignment_row.status not in ('ASSIGNED','ACCEPTED','CONFIRMED') then
    raise exception 'Este turno no está disponible para finalizar.';
  end if;

  update public.assignments
  set status='COMPLETED',
      response_at=coalesce(response_at,now()),
      updated_by=actor_profile_id,
      updated_at=now(),
      version=version+1
  where id=assignment_row.id;

  insert into public.audit_events(entity_type,entity_id,action,actor_id,reason,previous_state,new_state,orbit_event_id)
  select 'STAFF_OPERATIONAL_TURN',assignment_row.id::text,'COMPLETED',actor_profile_id,
    'El Staff finalizó su turno.',
    jsonb_build_object('assignmentId',assignment_row.id,'blockId',assignment_row.block_id,'status',assignment_row.status),
    jsonb_build_object('assignmentId',assignment_row.id,'blockId',assignment_row.block_id,'status','COMPLETED','completedAt',now()),
    p.orbit_event_id
  from public.projects p
  where p.id=p_project_id;

  insert into public.timeline_events(customer_id,project_id,staff_id,orbit_event_id,event_type,title,description,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason)
  select p.customer_id,p.id,p_staff_id,p.orbit_event_id,'STAFF_OPERATIONAL_TURN_COMPLETED',
    'Turno operativo finalizado',
    'El Staff finalizó únicamente su bloque operacional.',
    'Staff','Staff','STAFF_OPERATIONAL_TURN_COMPLETED','Assignment',assignment_row.id,
    'Turno operativo finalizado.',p_idempotency_key,'Finalizar mi turno'
  from public.projects p
  where p.id=p_project_id;

  return jsonb_build_object(
    'assignment_id',assignment_row.id,
    'block_id',assignment_row.block_id,
    'status','COMPLETED',
    'duplicate',false,
    'completed_at',now()
  );
end;
$$;

revoke all on function public.finalize_staff_operational_turn(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_staff_operational_turn(uuid,uuid,uuid,uuid,uuid,text) to service_role;

commit;
