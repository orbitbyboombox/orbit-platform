begin;

-- Block-level operator settlements must not be re-evaluated as event-level
-- operator settlements when a manual assembly/disassembly assignment changes.
create or replace function public.refresh_staff_event_payment(
  p_project_id uuid,
  p_staff_id uuid,
  p_actor uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_assignment uuid;
  selected_tasks text[];
  hours integer;
  operator_amount numeric(14,2) := 0;
  assembly_amount numeric(14,2) := 0;
  disassembly_amount numeric(14,2) := 0;
  existing_payment public.event_staff_payments%rowtype;
  payment_id uuid;
  event_code text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':'||p_staff_id::text||':event-settlement',0));

  -- Block assignments have their own payment row and are refreshed by
  -- refresh_staff_block_payment. Only event-level assignments belong here.
  select (array_agg(id order by id))[1],array_agg(distinct assignment_type order by assignment_type)
    into selected_assignment,selected_tasks
  from public.assignments
  where project_id=p_project_id and staff_id=p_staff_id and block_id is null
    and deleted_at is null and status not in('CANCELLED','REJECTED')
    and assignment_type in('OPERATOR','ASSEMBLY','DISASSEMBLY');

  if selected_assignment is null then
    update public.event_staff_payments
      set status='CANCELLED',deleted_at=coalesce(deleted_at,now()),updated_by=p_actor
    where project_id=p_project_id and staff_id=p_staff_id and block_id is null
      and deleted_at is null;
    return null;
  end if;

  select max(duration_hours)::integer into hours
  from public.project_services where project_id=p_project_id;
  if hours is null then raise exception 'El Evento no tiene una duración oficial configurada.'; end if;
  select orbit_event_id into event_code from public.projects where id=p_project_id;

  -- Keep the legacy rate only for a genuine event-level operator. Block
  -- operators never reach this function and are priced by their block.
  if 'OPERATOR'=any(selected_tasks) then
    select amount into operator_amount from public.cost_master_entries
      where code='OPERATOR_'||hours||'_HOURS' and enabled and deleted_at is null;
    if coalesce(operator_amount,0)<=0 then
      raise exception 'Falta la tarifa oficial de Operador para % horas.',hours;
    end if;
  end if;
  if 'ASSEMBLY'=any(selected_tasks) then
    select amount into assembly_amount from public.cost_master_entries where code='ASSEMBLY' and enabled and deleted_at is null;
    if coalesce(assembly_amount,0)<=0 then raise exception 'Falta la tarifa oficial de Montaje.'; end if;
  end if;
  if 'DISASSEMBLY'=any(selected_tasks) then
    select amount into disassembly_amount from public.cost_master_entries where code='DISASSEMBLY' and enabled and deleted_at is null;
    if coalesce(disassembly_amount,0)<=0 then raise exception 'Falta la tarifa oficial de Desmontaje.'; end if;
  end if;
  if 'ASSEMBLY'=any(selected_tasks) and 'DISASSEMBLY'=any(selected_tasks) then
    select amount into assembly_amount from public.cost_master_entries where code='ASSEMBLY_DISASSEMBLY' and enabled and deleted_at is null;
    if coalesce(assembly_amount,0)<=0 then raise exception 'Falta la tarifa oficial de Montaje + Desmontaje.'; end if;
    disassembly_amount:=assembly_amount-round(assembly_amount/2); assembly_amount:=round(assembly_amount/2);
  end if;

  select * into existing_payment from public.event_staff_payments
  where project_id=p_project_id and staff_id=p_staff_id and block_id is null
    and deleted_at is null and status<>'CANCELLED'
  order by (override_at is not null) desc,updated_at desc limit 1;

  if existing_payment.id is null then
    insert into public.event_staff_payments(project_id,assignment_id,staff_id,orbit_event_id,contracted_hours,tasks,destination_province,assembly_payment,operator_payment,disassembly_payment,automatic_assembly_payment,automatic_operator_payment,automatic_disassembly_payment,created_by,updated_by)
    values(p_project_id,selected_assignment,p_staff_id,event_code,hours,selected_tasks,'SANTIAGO',assembly_amount,operator_amount,disassembly_amount,assembly_amount,operator_amount,disassembly_amount,p_actor,p_actor)
    returning id into payment_id;
  else
    update public.event_staff_payments set assignment_id=selected_assignment,contracted_hours=hours,tasks=selected_tasks,
      automatic_assembly_payment=assembly_amount,automatic_operator_payment=operator_amount,automatic_disassembly_payment=disassembly_amount,
      assembly_payment=case when override_at is null and override_assembly_payment is null then assembly_amount else assembly_payment end,
      operator_payment=case when override_at is null and override_operator_payment is null then operator_amount else operator_payment end,
      disassembly_payment=case when override_at is null and override_disassembly_payment is null then disassembly_amount else disassembly_payment end,
      updated_by=p_actor where id=existing_payment.id returning id into payment_id;
  end if;
  return payment_id;
end $$;

-- Assign a reviewed request to its persisted operational block. The existing
-- event-level function remains unchanged for traditional assignments.
create or replace function public.assign_event_operational_responsibility_for_block(
  p_project_id uuid,p_block_id uuid,p_staff_id uuid,p_responsibility text,p_reason text
)
returns uuid[] language plpgsql set search_path=public as $$
declare roles text[]; role_name text; created uuid[] := '{}'; new_id uuid;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede asignar Staff.'; end if;
  if not exists(select 1 from public.event_operational_blocks where id=p_block_id and project_id=p_project_id) then raise exception 'Bloque operacional no encontrado.'; end if;
  if p_responsibility not in('OPERATOR','ASSEMBLY','DISASSEMBLY','ASSEMBLY_DISASSEMBLY') then raise exception 'Responsabilidad inválida.'; end if;
  roles:=case when p_responsibility='ASSEMBLY_DISASSEMBLY' then array['ASSEMBLY','DISASSEMBLY'] else array[p_responsibility] end;
  if not exists(select 1 from public.staff where id=p_staff_id and status='ACTIVE' and deleted_at is null and capabilities @> roles) then raise exception 'El colaborador no está disponible o no tiene las responsabilidades requeridas.'; end if;
  foreach role_name in array roles loop
    if exists(select 1 from public.assignments where project_id=p_project_id and block_id=p_block_id and staff_id=p_staff_id and assignment_type=role_name and deleted_at is null and status not in('CANCELLED','REJECTED')) then raise exception 'El colaborador ya tiene la responsabilidad % en este bloque.',role_name; end if;
    insert into public.assignments(id,project_id,block_id,staff_id,assignment_type,status,resources,reason,created_by,updated_by)
    values(gen_random_uuid(),p_project_id,p_block_id,p_staff_id,role_name,'PENDING','{}',coalesce(nullif(p_reason,''),'Asignación operacional'),auth.uid(),auth.uid()) returning id into new_id;
    created:=created||new_id;
  end loop;
  return created;
end $$;
grant execute on function public.assign_event_operational_responsibility_for_block(uuid,uuid,uuid,text,text) to authenticated;

create or replace function public.review_staff_assignment_request(p_request_id uuid,p_approved boolean,p_reason text)
returns jsonb language plpgsql set search_path=public as $$
declare req public.staff_assignment_requests%rowtype; roles text[]; role_name text; assignment_ids uuid[]; settlement_id uuid; required_count integer; assigned_count integer; capacity_full boolean:=true;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede revisar solicitudes.'; end if;
  select * into req from public.staff_assignment_requests where id=p_request_id for update;
  if req.id is null then raise exception 'Solicitud no encontrada.'; end if;
  if req.status<>'PENDING' then raise exception 'La solicitud ya fue revisada.'; end if;
  if not p_approved then update public.staff_assignment_requests set status='REJECTED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason=p_reason,updated_at=now() where id=req.id; return jsonb_build_object('requestId',req.id,'status','REJECTED'); end if;
  perform set_config('orbit.timeline_boundary','deferred',true);
  perform pg_advisory_xact_lock(hashtextextended(req.project_id::text||':operational-assignment',0));
  roles:=case when req.responsibility='ASSEMBLY_DISASSEMBLY' then array['ASSEMBLY','DISASSEMBLY'] else array[req.responsibility] end;
  foreach role_name in array roles loop
    select required_quantity into required_count from public.event_staff_requirements
      where project_id=req.project_id and role=role_name and block_id is not distinct from req.block_id;
    select count(*) into assigned_count from public.assignments
      where project_id=req.project_id and assignment_type=role_name and block_id is not distinct from req.block_id
        and deleted_at is null and status not in('CANCELLED','REJECTED');
    if assigned_count>=coalesce(required_count,0) then raise exception 'El cupo de % ya está completo para este bloque.',role_name; end if;
  end loop;
  assignment_ids:=case when req.block_id is not null
    then public.assign_event_operational_responsibility_for_block(req.project_id,req.block_id,req.staff_id,req.responsibility,coalesce(nullif(p_reason,''),'Solicitud aprobada por Founder'))
    else public.assign_event_operational_responsibility(req.project_id,req.staff_id,req.responsibility,coalesce(nullif(p_reason,''),'Solicitud aprobada por Founder')) end;
  update public.assignments set status='CONFIRMED',accepted_at=req.requested_at,response_at=now(),updated_by=auth.uid() where id=any(assignment_ids) and deleted_at is null;
  settlement_id:=public.refresh_staff_event_payment(req.project_id,req.staff_id,auth.uid());
  if settlement_id is null and req.block_id is not null then select id into settlement_id from public.event_staff_payments where assignment_id=any(assignment_ids) and deleted_at is null and status<>'CANCELLED' limit 1; end if;
  if settlement_id is null then raise exception 'No fue posible crear la liquidación canónica del Evento.'; end if;
  update public.event_staff_payments set status='CONFIRMED',updated_by=auth.uid() where id=settlement_id;
  update public.staff_assignment_requests set status='CONFIRMED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason=p_reason,updated_at=now() where id=req.id;
  foreach role_name in array roles loop
    select required_quantity into required_count from public.event_staff_requirements where project_id=req.project_id and role=role_name and block_id is not distinct from req.block_id;
    select count(*) into assigned_count from public.assignments where project_id=req.project_id and assignment_type=role_name and block_id is not distinct from req.block_id and deleted_at is null and status not in('CANCELLED','REJECTED');
    if assigned_count<coalesce(required_count,0) then capacity_full:=false; end if;
  end loop;
  if capacity_full then update public.staff_assignment_requests set status='REJECTED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason='Cupo cubierto',updated_at=now() where project_id=req.project_id and id<>req.id and status='PENDING' and responsibility=req.responsibility and block_id is not distinct from req.block_id; end if;
  perform public.refresh_event_operational_readiness(req.project_id,auth.uid());
  return jsonb_build_object('requestId',req.id,'status','CONFIRMED','assignmentIds',assignment_ids,'settlementId',settlement_id);
end $$;
grant execute on function public.review_staff_assignment_request(uuid,boolean,text) to authenticated;

commit;
