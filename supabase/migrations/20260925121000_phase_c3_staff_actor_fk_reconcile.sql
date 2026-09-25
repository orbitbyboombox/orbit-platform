begin;

-- Staff authorization uses public.staff.id; audit/FK columns use the linked
-- auth profile. Keep the two identities explicit and transaction-local.
create or replace function public.record_staff_box_media_return(
  p_project_id uuid,p_media_lot_id uuid,p_remaining_photo_capacity numeric,
  p_note text,p_incident_flag boolean,p_idempotency_key text,p_staff_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare lot_row public.box_media_lots%rowtype; assignment_id uuid; project_row record; movement_id uuid;
  actor_id uuid; before_balance numeric; delta numeric;
begin
  if p_staff_id is null or p_project_id is null or p_media_lot_id is null or nullif(trim(p_idempotency_key),'') is null then raise exception 'Incomplete staff media return.'; end if;
  select s.profile_id into actor_id from public.staff s where s.id=p_staff_id and s.deleted_at is null;
  if actor_id is null then raise exception 'Staff profile is not authenticated.'; end if;
  select im.id into movement_id from public.inventory_movements im where im.idempotency_key=p_idempotency_key and im.movement_type='EVENT_USAGE';
  if movement_id is not null then return jsonb_build_object('movement_id',movement_id,'duplicate',true); end if;
  select a.id into assignment_id from public.box_media_lots l join public.asset_assignments a on a.asset_id=l.box_asset_id and a.project_id=p_project_id and a.assignment_status in('ASSIGNED','CONFIRMED','ACCEPTED','IN_EVENT') and a.deleted_at is null where l.id=p_media_lot_id and l.status<>'DISCARDED';
  select l into lot_row from public.box_media_lots l where l.id=p_media_lot_id and l.status<>'DISCARDED' for update;
  if assignment_id is null then raise exception 'No active BOX assignment for this Event.'; end if;
  if not exists(select 1 from public.assignments where project_id=p_project_id and staff_id=p_staff_id and status in('CONFIRMED','ACCEPTED','COMPLETED') and deleted_at is null) then raise exception 'Staff is not assigned to this Event.'; end if;
  if p_remaining_photo_capacity is null or p_remaining_photo_capacity<0 then raise exception 'Return count cannot be negative.'; end if;
  before_balance:=lot_row.remaining_photo_capacity;
  if p_remaining_photo_capacity>before_balance then raise exception 'Return count cannot exceed checkout balance.'; end if;
  delta:=p_remaining_photo_capacity-before_balance;
  if delta=0 then raise exception 'Return count must change the media balance.'; end if;
  select id,customer_id,orbit_event_id into project_row from public.projects where id=p_project_id;
  insert into public.inventory_movements(supply_id,customer_id,project_id,orbit_event_id,staff_id,movement_type,quantity,occurred_at,reason,created_by,updated_by,box_asset_id,printer_asset_id,media_lot_id,format_key,lot,quantity_before,quantity_delta,quantity_after,idempotency_key)
  values(lot_row.supply_id,project_row.customer_id,p_project_id,project_row.orbit_event_id,p_staff_id,'EVENT_USAGE',delta,now(),coalesce(nullif(trim(p_note),''),'Staff media return'),actor_id,actor_id,lot_row.box_asset_id,lot_row.printer_asset_id,p_media_lot_id,lot_row.format_key,lot_row.lot,before_balance,delta,p_remaining_photo_capacity,p_idempotency_key) returning id into movement_id;
  insert into public.asset_assignment_inspections(asset_assignment_id,component_asset_id,inspection_type,inspection_status,notes,incident_flag,idempotency_key,inspected_by,created_by,updated_by)
  values(assignment_id,lot_row.box_asset_id,'CHECK_IN',case when coalesce(p_incident_flag,false) then 'DAMAGED' else 'OK' end,nullif(trim(p_note),''),coalesce(p_incident_flag,false),p_idempotency_key||':media',actor_id,actor_id,actor_id)
  on conflict(asset_assignment_id,inspection_type,component_asset_id) do nothing;
  return jsonb_build_object('movement_id',movement_id,'duplicate',false,'before',before_balance,'delta',delta,'after',p_remaining_photo_capacity);
end $$;

create or replace function public.record_staff_box_check_out(p_project_id uuid,p_asset_assignment_id uuid,p_components jsonb,p_idempotency_key text,p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item record; component jsonb; component_id uuid; actor_id uuid; result_count integer:=0;
begin
  select s.profile_id into actor_id from public.staff s where s.id=p_staff_id and s.deleted_at is null;
  if actor_id is null then raise exception 'Staff profile is not authenticated.'; end if;
  select a.id,a.asset_id into item from public.asset_assignments a join public.assignments sa on sa.project_id=a.project_id and sa.staff_id=p_staff_id and sa.deleted_at is null and sa.status in('CONFIRMED','ACCEPTED','COMPLETED') and sa.assignment_type in('OPERATOR','ASSEMBLY') where a.id=p_asset_assignment_id and a.project_id=p_project_id and a.deleted_at is null and a.assignment_status='ASSIGNED';
  if not found then raise exception 'Staff no autorizado para CHECK_OUT de esta Caja.'; end if;
  for component in select value from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) loop
    component_id:=(component->>'componentId')::uuid;
    if component->>'status' not in('OK','MISSING','DAMAGED','MAINTENANCE_REQUIRED') then raise exception 'Estado de componente inválido.'; end if;
    insert into public.asset_assignment_inspections(asset_assignment_id,component_asset_id,inspection_type,inspection_status,notes,incident_flag,idempotency_key,inspected_by,created_by,updated_by)
    values(item.id,component_id,'CHECK_OUT',component->>'status',nullif(trim(component->>'notes'),''),coalesce((component->>'incident')::boolean,false),p_idempotency_key||':'||component_id,actor_id,actor_id,actor_id)
    on conflict(asset_assignment_id,inspection_type,component_asset_id) do nothing;
    result_count:=result_count+1;
  end loop;
  return jsonb_build_object('assignmentId',item.id,'inspectionType','CHECK_OUT','components',result_count);
end $$;

create or replace function public.record_staff_box_check_in(p_project_id uuid,p_asset_assignment_id uuid,p_media_lot_id uuid,p_remaining_photo_capacity numeric,p_components jsonb,p_note text,p_incident boolean,p_idempotency_key text,p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item record; component jsonb; component_id uuid; movement_result jsonb; actor_id uuid; result_count integer:=0;
begin
  select s.profile_id into actor_id from public.staff s where s.id=p_staff_id and s.deleted_at is null;
  if actor_id is null then raise exception 'Staff profile is not authenticated.'; end if;
  select a.id,a.asset_id into item from public.asset_assignments a join public.assignments sa on sa.project_id=a.project_id and sa.staff_id=p_staff_id and sa.deleted_at is null and sa.status in('CONFIRMED','ACCEPTED','COMPLETED') and sa.assignment_type in('OPERATOR','DISASSEMBLY') where a.id=p_asset_assignment_id and a.project_id=p_project_id and a.deleted_at is null;
  if not found then raise exception 'Staff no autorizado para CHECK_IN de esta Caja.'; end if;
  select public.record_staff_box_media_return(p_project_id,p_media_lot_id,p_remaining_photo_capacity,p_note,p_incident,p_idempotency_key,p_staff_id) into movement_result;
  for component in select value from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) loop
    component_id:=(component->>'componentId')::uuid;
    if component->>'status' not in('OK','MISSING','DAMAGED','MAINTENANCE_REQUIRED') then raise exception 'Estado de componente inválido.'; end if;
    insert into public.asset_assignment_inspections(asset_assignment_id,component_asset_id,inspection_type,inspection_status,notes,incident_flag,idempotency_key,inspected_by,created_by,updated_by)
    values(item.id,component_id,'CHECK_IN',component->>'status',nullif(trim(component->>'notes'),''),coalesce((component->>'incident')::boolean,false),p_idempotency_key||':'||component_id,actor_id,actor_id,actor_id)
    on conflict(asset_assignment_id,inspection_type,component_asset_id) do nothing;
    result_count:=result_count+1;
  end loop;
  update public.asset_assignments set assignment_status='RETURNED',return_condition=case when p_incident then 'REQUIRES_REVIEW' else 'OK' end,return_notes=nullif(trim(p_note),''),return_confirmed_by=actor_id,return_confirmed_at=now(),returned_at=coalesce(returned_at,now()),updated_by=actor_id where id=item.id;
  update public.operational_assets set status=case when p_incident then 'MAINTENANCE' else 'AVAILABLE' end,updated_by=actor_id where id=item.asset_id;
  if p_incident then insert into public.event_incidents(project_id,asset_id,asset_assignment_id,incident_type,severity,status,description,created_by) values(p_project_id,item.asset_id,item.id,'EQUIPMENT','HIGH','OPEN',coalesce(nullif(trim(p_note),''),'Incidente operacional informado por Staff.'),actor_id) on conflict(asset_assignment_id,incident_type) do update set status='OPEN',severity='HIGH',description=excluded.description,updated_at=now(); end if;
  return jsonb_build_object('assignmentId',item.id,'movement',movement_result,'components',result_count,'reviewRequired',p_incident);
end $$;

commit;
