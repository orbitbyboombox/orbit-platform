begin;

alter table public.asset_history drop constraint if exists asset_history_history_type_check;
alter table public.asset_history add constraint asset_history_history_type_check check (history_type in ('OPERATION','MAINTENANCE','INCIDENT','CLEANING','STATUS_CHANGE','WAREHOUSE_CHECKOUT','WAREHOUSE_RETURN'));

create or replace function public.assign_operational_asset(p_project_id uuid,p_asset_id uuid,p_reason text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); asset_record public.operational_assets%rowtype; project_record public.projects%rowtype; previous_record record; assignment_id uuid; correlation text:=gen_random_uuid()::text; action_name text; noun text;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Operaciones puede asignar equipos.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'La asignación requiere un motivo.'; end if;
  select * into asset_record from public.operational_assets where id=p_asset_id and deleted_at is null for update;
  if not found then raise exception 'Equipo no encontrado.'; end if;
  if asset_record.status <> 'AVAILABLE' then raise exception '% no está disponible.',asset_record.asset_code; end if;
  select * into project_record from public.projects where id=p_project_id and deleted_at is null;
  if not found then raise exception 'Evento no encontrado.'; end if;
  select aa.id,aa.asset_id,oa.asset_code into previous_record from public.asset_assignments aa join public.operational_assets oa on oa.id=aa.asset_id where aa.project_id=p_project_id and oa.asset_type=asset_record.asset_type and aa.assignment_status='ASSIGNED' and aa.deleted_at is null for update of aa limit 1;
  if found then
    update public.asset_assignments set assignment_status='RETURNED',returned_at=now(),updated_by=actor where id=previous_record.id;
    update public.operational_assets set status='AVAILABLE',updated_by=actor where id=previous_record.asset_id;
    insert into public.asset_history(asset_id,project_id,history_type,message,previous_state,new_state,actor_id,orbit_event_id,correlation_id) values(previous_record.asset_id,p_project_id,'OPERATION',previous_record.asset_code||' reemplazado manualmente.',jsonb_build_object('status','ASSIGNED'),jsonb_build_object('status','AVAILABLE'),actor,project_record.orbit_event_id,gen_random_uuid()::text);
    insert into public.timeline_events(project_id,event_type,title,description,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by) values(p_project_id,'EQUIPMENT_CHANGED','Equipo reemplazado.',previous_record.asset_code||' fue reemplazado por '||asset_record.asset_code||'.',project_record.orbit_event_id,actor,'Operaciones','Operations','EQUIPMENT_CHANGED','Asset',p_asset_id,'Equipo actualizado: '||previous_record.asset_code||' → '||asset_record.asset_code||'.',gen_random_uuid()::text,actor);
  end if;
  insert into public.asset_assignments(project_id,asset_id,assigned_by,reason,created_by,updated_by) values(p_project_id,p_asset_id,actor,trim(p_reason),actor,actor) returning id into assignment_id;
  update public.operational_assets set status='ASSIGNED',usage_counter=usage_counter+1,updated_by=actor where id=p_asset_id;
  noun:=case when asset_record.asset_type='CASE' then 'Case' else 'Totem' end;
  action_name:=case when asset_record.asset_type='CASE' then 'CASE_ASSIGNED' else 'TOTEM_ASSIGNED' end;
  insert into public.asset_history(asset_id,project_id,history_type,message,previous_state,new_state,actor_id,orbit_event_id,correlation_id) values(p_asset_id,p_project_id,'OPERATION',asset_record.asset_code||' asignado manualmente.',jsonb_build_object('status','AVAILABLE'),jsonb_build_object('status','ASSIGNED'),actor,project_record.orbit_event_id,correlation);
  insert into public.timeline_events(project_id,event_type,title,description,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by) values(p_project_id,action_name,noun||' asignado.',asset_record.asset_code||' fue asignado manualmente.',project_record.orbit_event_id,actor,'Operaciones','Operations',action_name,'Asset',p_asset_id,noun||' '||asset_record.asset_code||' asignado al evento.',correlation,actor);
  return assignment_id;
end $$;

create or replace function public.release_operational_asset(p_assignment_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); item record; correlation text:=gen_random_uuid()::text;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Operaciones puede liberar equipos.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'La liberación requiere un motivo.'; end if;
  select aa.*,oa.asset_code,p.orbit_event_id into item from public.asset_assignments aa join public.operational_assets oa on oa.id=aa.asset_id join public.projects p on p.id=aa.project_id where aa.id=p_assignment_id and aa.assignment_status='ASSIGNED' and aa.deleted_at is null for update of aa;
  if not found then raise exception 'La asignación ya no está activa.'; end if;
  update public.asset_assignments set assignment_status='RETURNED',returned_at=now(),reason=trim(p_reason),updated_by=actor where id=p_assignment_id;
  update public.operational_assets set status='AVAILABLE',updated_by=actor where id=item.asset_id;
  insert into public.asset_history(asset_id,project_id,history_type,message,previous_state,new_state,actor_id,orbit_event_id,correlation_id) values(item.asset_id,item.project_id,'OPERATION',item.asset_code||' liberado manualmente.',jsonb_build_object('status','ASSIGNED'),jsonb_build_object('status','AVAILABLE'),actor,item.orbit_event_id,correlation);
  insert into public.timeline_events(project_id,event_type,title,description,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by) values(item.project_id,'EQUIPMENT_RELEASED','Equipo liberado.',item.asset_code||' quedó disponible.',item.orbit_event_id,actor,'Operaciones','Operations','EQUIPMENT_RELEASED','Asset',item.asset_id,'Equipo '||item.asset_code||' liberado.',correlation,actor);
end $$;

create or replace function public.validate_assignment_capability() returns trigger language plpgsql set search_path=public as $$
declare allowed text[];
begin
  if new.assignment_type not in ('ASSEMBLY','OPERATOR','DISASSEMBLY') then return new; end if;
  select capabilities into allowed from public.staff where id=new.staff_id and deleted_at is null and status='ACTIVE';
  if allowed is null then raise exception 'El colaborador no está activo.'; end if;
  if not new.assignment_type=any(allowed) then raise exception 'El colaborador no tiene capacidad para esta tarea.'; end if;
  return new;
end $$;
drop trigger if exists assignments_capability_guard on public.assignments;
create trigger assignments_capability_guard before insert or update of staff_id,assignment_type on public.assignments for each row execute function public.validate_assignment_capability();

revoke all on function public.assign_operational_asset(uuid,uuid,text) from public;
revoke all on function public.release_operational_asset(uuid,text) from public;
grant execute on function public.assign_operational_asset(uuid,uuid,text) to authenticated;
grant execute on function public.release_operational_asset(uuid,text) to authenticated;

commit;
