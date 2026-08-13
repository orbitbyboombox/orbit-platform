begin;

alter table public.staff_assignment_requests
  add column if not exists staff_decision_reason text,
  add column if not exists staff_decision_detail text,
  add column if not exists staff_decided_at timestamptz;

alter table public.staff_assignment_requests drop constraint if exists staff_assignment_requests_status_check;
alter table public.staff_assignment_requests add constraint staff_assignment_requests_status_check
  check(status in('PENDING','APPROVED','REJECTED','DECLINED','CANCELLED','CONFIRMED'));

create or replace function public.decline_staff_responsibility(
  p_staff_id uuid,
  p_project_id uuid,
  p_responsibility text,
  p_reason text,
  p_detail text default ''
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  result uuid;
  project_record public.projects%rowtype;
  staff_name text;
begin
  if p_responsibility not in('OPERATOR','ASSEMBLY','DISASSEMBLY','ASSEMBLY_DISASSEMBLY') then
    raise exception 'Responsabilidad inválida.';
  end if;
  if p_reason not in('ILLNESS','EMERGENCY','UNAVAILABLE','DISTANCE','OTHER') then
    raise exception 'Selecciona un motivo válido.';
  end if;
  if p_reason='OTHER' and nullif(trim(p_detail),'') is null then
    raise exception 'Describe el motivo.';
  end if;
  if not exists(select 1 from public.staff where id=p_staff_id and status='ACTIVE' and deleted_at is null) then
    raise exception 'Colaborador no disponible.';
  end if;
  select * into project_record from public.projects where id=p_project_id and deleted_at is null;
  if project_record.id is null then raise exception 'Evento no disponible.'; end if;
  select trim(concat_ws(' ',first_name,last_name)) into staff_name from public.staff where id=p_staff_id;

  update public.staff_assignment_requests
  set status='DECLINED',staff_decision_reason=p_reason,staff_decision_detail=nullif(trim(p_detail),''),staff_decided_at=now(),updated_at=now()
  where project_id=p_project_id and staff_id=p_staff_id and responsibility=p_responsibility and status='PENDING'
  returning id into result;
  if result is null then
    insert into public.staff_assignment_requests(project_id,staff_id,responsibility,status,staff_decision_reason,staff_decision_detail,staff_decided_at)
    values(p_project_id,p_staff_id,p_responsibility,'DECLINED',p_reason,nullif(trim(p_detail),''),now()) returning id into result;
  end if;

  insert into public.internal_notifications(project_id,customer_id,staff_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href,metadata)
  values(project_record.id,project_record.customer_id,p_staff_id,'STAFF_ASSIGNMENT_DECLINED','Staff rechazó un Evento',staff_name||' rechazó '||p_responsibility||' · Motivo: '||p_reason,'UNREAD','staff-declined:'||result,'OPERATIONS','HIGH',true,'AssignmentRequest',result,'/projects/'||project_record.id||'#staff-assignment',jsonb_build_object('reason',p_reason,'detail',p_detail))
  on conflict(correlation_id) do nothing;

  insert into public.timeline_events(customer_id,project_id,staff_id,orbit_event_id,event_type,title,description,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason)
  values(project_record.customer_id,project_record.id,p_staff_id,project_record.orbit_event_id,'STAFF_DECLINED','Staff rechazó el Evento','El colaborador rechazó la responsabilidad antes de la aprobación.','Staff','StaffPortal','STAFF_DECLINED','AssignmentRequest',result,staff_name||' rechazó '||p_responsibility,'staff-declined:'||result,p_reason||case when nullif(trim(p_detail),'') is null then '' else ' · '||trim(p_detail) end);
  return result;
end $$;
revoke all on function public.decline_staff_responsibility(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.decline_staff_responsibility(uuid,uuid,text,text,text) to service_role;

drop function if exists public.review_staff_assignment_request(uuid,boolean,text);
create function public.review_staff_assignment_request(p_request_id uuid,p_approved boolean,p_reason text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  req public.staff_assignment_requests%rowtype;
  occupied text[];
  roles text[];
  role_name text;
  assignment_ids uuid[];
  settlement_id uuid;
  project_record public.projects%rowtype;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede revisar solicitudes.'; end if;
  select * into req from public.staff_assignment_requests where id=p_request_id for update;
  if req.id is null then raise exception 'Solicitud no encontrada.'; end if;
  if req.status<>'PENDING' then raise exception 'La solicitud ya fue revisada.'; end if;
  if not p_approved then
    update public.staff_assignment_requests set status='REJECTED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason=p_reason,updated_at=now() where id=req.id;
    return jsonb_build_object('requestId',req.id,'status','REJECTED');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(req.project_id::text||':operational-assignment',0));
  roles:=case when req.responsibility='ASSEMBLY_DISASSEMBLY' then array['ASSEMBLY','DISASSEMBLY'] else array[req.responsibility] end;
  foreach role_name in array roles loop
    if exists(select 1 from public.assignments where project_id=req.project_id and assignment_type=role_name and deleted_at is null and status not in('CANCELLED','REJECTED')) then
      raise exception 'La responsabilidad % ya fue asignada. La aprobación no creó duplicados.',role_name;
    end if;
  end loop;

  assignment_ids:=public.assign_event_operational_responsibility(req.project_id,req.staff_id,req.responsibility,coalesce(nullif(p_reason,''),'Solicitud aprobada por Founder'));
  update public.assignments set status='CONFIRMED',accepted_at=req.requested_at,response_at=now(),updated_by=auth.uid()
  where id=any(assignment_ids) and deleted_at is null;
  settlement_id:=public.refresh_staff_event_payment(req.project_id,req.staff_id,auth.uid());
  if settlement_id is null then raise exception 'No fue posible crear la liquidación canónica del Evento.'; end if;
  update public.event_staff_payments set status='CONFIRMED',updated_by=auth.uid() where id=settlement_id;
  update public.staff_assignment_requests set status='CONFIRMED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason=p_reason,updated_at=now() where id=req.id;

  occupied:=case when req.responsibility='ASSEMBLY_DISASSEMBLY' then array['ASSEMBLY','DISASSEMBLY','ASSEMBLY_DISASSEMBLY'] when req.responsibility in('ASSEMBLY','DISASSEMBLY') then array[req.responsibility,'ASSEMBLY_DISASSEMBLY'] else array[req.responsibility] end;
  update public.staff_assignment_requests set status='REJECTED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason='Responsabilidad asignada a otro colaborador',updated_at=now()
  where project_id=req.project_id and id<>req.id and status='PENDING' and responsibility=any(occupied);

  select * into project_record from public.projects where id=req.project_id;
  insert into public.timeline_events(customer_id,project_id,staff_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id)
  values
    (project_record.customer_id,req.project_id,req.staff_id,project_record.orbit_event_id,'STAFF_ACCEPTED','Staff aceptó el Evento','El colaborador revisó el resumen operacional y el pago estimado antes de aceptar.',auth.uid(),'Founder','StaffAssignment','STAFF_ACCEPTED','AssignmentRequest',req.id,'Staff aceptó la responsabilidad solicitada.','smart-assignment:'||req.id||':accepted'),
    (project_record.customer_id,req.project_id,req.staff_id,project_record.orbit_event_id,'FOUNDER_APPROVED','Founder aprobó la asignación','La aprobación se convirtió en la asignación oficial.',auth.uid(),'Founder','StaffAssignment','FOUNDER_APPROVED','AssignmentRequest',req.id,'Founder aprobó la solicitud.','smart-assignment:'||req.id||':approved'),
    (project_record.customer_id,req.project_id,req.staff_id,project_record.orbit_event_id,'ASSIGNMENT_CREATED','Asignación creada','ORBIT creó la asignación canónica sin segundo paso manual.',auth.uid(),'Founder','StaffAssignment','ASSIGNMENT_CREATED','Assignment',assignment_ids[1],'Asignación oficial creada.','smart-assignment:'||req.id||':assignment'),
    (project_record.customer_id,req.project_id,req.staff_id,project_record.orbit_event_id,'SETTLEMENT_CREATED','Liquidación creada','La liquidación canónica del Evento quedó confirmada.',auth.uid(),'Founder','StaffAssignment','SETTLEMENT_CREATED','EventStaffPayment',settlement_id,'Liquidación oficial creada.','smart-assignment:'||req.id||':settlement')
  on conflict(correlation_id) do nothing;
  return jsonb_build_object('requestId',req.id,'status','CONFIRMED','assignmentIds',assignment_ids,'settlementId',settlement_id);
end $$;
grant execute on function public.review_staff_assignment_request(uuid,boolean,text) to authenticated;

commit;
