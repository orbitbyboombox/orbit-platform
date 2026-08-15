begin;

-- Timeline classifies the actor/source domain, not the UI surface.  `Staff` is
-- the established value allowed by timeline_events_source_check; using the
-- component name `StaffPortal` made the canonical check-in transaction fail.
create or replace function public.record_staff_portal_checkin(p_staff_id uuid,p_project_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid; event_code text; customer uuid; label text; required_role text; assignment_id uuid;
begin
  required_role:=case when p_status in('ASSEMBLY_STARTED','ASSEMBLY_COMPLETED') then 'ASSEMBLY'
    when p_status in('EVENT_STARTED','EVENT_FINISHED') then 'OPERATOR'
    when p_status in('DISASSEMBLY_STARTED','DISASSEMBLY_COMPLETED') then 'DISASSEMBLY' end;
  if p_status not in('ON_THE_WAY','ARRIVED','ASSEMBLY_STARTED','ASSEMBLY_COMPLETED','EVENT_STARTED','EVENT_FINISHED','DISASSEMBLY_STARTED','DISASSEMBLY_COMPLETED') then raise exception 'Estado operacional inválido.'; end if;
  select id into assignment_id from public.assignments where project_id=p_project_id and staff_id=p_staff_id and deleted_at is null
    and status not in('CANCELLED','REJECTED') and (required_role is null or assignment_type=required_role) order by created_at limit 1;
  if assignment_id is null then raise exception 'Esta acción no corresponde a tus responsabilidades confirmadas.'; end if;
  if p_status<>'ON_THE_WAY' and p_status<>'ARRIVED' and not exists(select 1 from public.staff_event_checkins where project_id=p_project_id and staff_id=p_staff_id and status='ARRIVED') then raise exception 'Registra primero tu llegada.'; end if;
  if p_status='ASSEMBLY_COMPLETED' and not exists(select 1 from public.staff_event_checkins where project_id=p_project_id and staff_id=p_staff_id and status='ASSEMBLY_STARTED') then raise exception 'Inicia primero el montaje.'; end if;
  if p_status='EVENT_FINISHED' and not exists(select 1 from public.staff_event_checkins where project_id=p_project_id and staff_id=p_staff_id and status='EVENT_STARTED') then raise exception 'Inicia primero el servicio.'; end if;
  if p_status='DISASSEMBLY_COMPLETED' and not exists(select 1 from public.staff_event_checkins where project_id=p_project_id and staff_id=p_staff_id and status='DISASSEMBLY_STARTED') then raise exception 'Inicia primero el desmontaje.'; end if;
  insert into public.staff_event_checkins(project_id,staff_id,status) values(p_project_id,p_staff_id,p_status)
    on conflict(project_id,staff_id,status) do update set occurred_at=staff_event_checkins.occurred_at returning id into result;
  label:=case p_status when 'ON_THE_WAY' then 'En camino' when 'ARRIVED' then 'Llegó' when 'ASSEMBLY_STARTED' then 'Montaje iniciado' when 'ASSEMBLY_COMPLETED' then 'Montaje listo' when 'EVENT_STARTED' then 'Servicio iniciado' when 'EVENT_FINISHED' then 'Servicio finalizado' when 'DISASSEMBLY_STARTED' then 'Desmontaje iniciado' else 'Desmontaje completo' end;
  if p_status in('ASSEMBLY_COMPLETED','EVENT_FINISHED','DISASSEMBLY_COMPLETED') then
    update public.assignments set status='COMPLETED',response_at=now() where project_id=p_project_id and staff_id=p_staff_id and assignment_type=required_role and deleted_at is null and status not in('CANCELLED','REJECTED');
  end if;
  select orbit_event_id,customer_id into event_code,customer from public.projects where id=p_project_id;
  insert into public.timeline_events(customer_id,project_id,staff_id,event_type,title,description,orbit_event_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id)
  values(customer,p_project_id,p_staff_id,p_status,label,label,event_code,'Staff','Staff',p_status,'StaffEventCheckin',result,label||' registrado desde Portal Staff.','staff-checkin:'||result)
  on conflict(correlation_id) do nothing;
  return result;
end $$;
revoke all on function public.record_staff_portal_checkin(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_staff_portal_checkin(uuid,uuid,text) to service_role;

commit;
