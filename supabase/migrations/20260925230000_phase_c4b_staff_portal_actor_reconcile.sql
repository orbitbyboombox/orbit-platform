begin;

-- Phase C.4B reconciles Phase C operational actions with the canonical
-- RUT/PIN Staff Portal session. staff.profile_id remains optional legacy
-- metadata; the operational actor is staff_id + portal_session_id.
alter table public.asset_assignment_inspections
  add column if not exists staff_id uuid references public.staff(id),
  add column if not exists portal_session_id uuid references public.portal_access_sessions(id);

alter table public.inventory_movements
  add column if not exists portal_session_id uuid references public.portal_access_sessions(id);

alter table public.event_incidents
  add column if not exists staff_id uuid references public.staff(id),
  add column if not exists portal_session_id uuid references public.portal_access_sessions(id);

-- A RUT/PIN Staff actor has no auth.users row. Keep the existing FK intact,
-- but allow the optional profile actor to be null when the staff_id actor is
-- recorded. This only affects the Phase C operational incident table.
alter table public.event_incidents
  alter column created_by drop not null;

create index if not exists asset_assignment_inspections_staff_session_idx
  on public.asset_assignment_inspections(staff_id, portal_session_id);
create index if not exists inventory_movements_staff_session_idx
  on public.inventory_movements(staff_id, portal_session_id);
create index if not exists event_incidents_staff_session_idx
  on public.event_incidents(staff_id, portal_session_id);

create or replace function public.resolve_phase_c_staff_portal_actor(
  p_staff_id uuid,
  p_portal_session_id uuid
) returns table(resolved_staff_id uuid, profile_id uuid)
language plpgsql security definer set search_path=public as $$
begin
  if p_staff_id is null or p_portal_session_id is null then
    raise exception 'Staff portal session is required.';
  end if;
  return query
  select s.id, s.profile_id
  from public.portal_access_sessions pas
  join public.staff s on s.id=pas.staff_id
  where pas.id=p_portal_session_id
    and pas.access_type='STAFF'
    and pas.staff_id=p_staff_id
    and pas.expires_at>now()
    and pas.revoked_at is null
    and s.deleted_at is null
    and s.status='ACTIVE'
    and s.portal_enabled=true;
  if not found then
    raise exception 'Staff portal session is invalid or expired.';
  end if;
end $$;

create or replace function public.record_staff_box_media_return(
  p_project_id uuid,p_media_lot_id uuid,p_remaining_photo_capacity numeric,
  p_note text,p_incident_flag boolean,p_idempotency_key text,p_staff_id uuid,
  p_portal_session_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare lot_row public.box_media_lots%rowtype; assignment_id uuid; project_row record; movement_id uuid;
  resolved_staff_id uuid; actor_profile_id uuid; before_balance numeric; delta numeric; inspection_id uuid;
begin
  select a.resolved_staff_id,a.profile_id into resolved_staff_id,actor_profile_id
  from public.resolve_phase_c_staff_portal_actor(p_staff_id,p_portal_session_id) a;
  if p_project_id is null or p_media_lot_id is null or nullif(trim(p_idempotency_key),'') is null then raise exception 'Incomplete staff media return.'; end if;
  select im.id into movement_id from public.inventory_movements im where im.idempotency_key=p_idempotency_key and im.movement_type='EVENT_USAGE';
  if movement_id is not null then return jsonb_build_object('movement_id',movement_id,'duplicate',true); end if;
  select a.id into assignment_id
  from public.box_media_lots l
  join public.asset_assignments a on a.asset_id=l.box_asset_id and a.project_id=p_project_id
    and a.assignment_status in('ASSIGNED','CONFIRMED','ACCEPTED','IN_EVENT') and a.deleted_at is null
  where l.id=p_media_lot_id and l.status<>'DISCARDED';
  select * into lot_row from public.box_media_lots l where l.id=p_media_lot_id and l.status<>'DISCARDED' for update;
  if assignment_id is null then raise exception 'No active BOX assignment for this Event.'; end if;
  if not exists(select 1 from public.assignments where project_id=p_project_id and staff_id=resolved_staff_id and status in('CONFIRMED','ACCEPTED','COMPLETED') and deleted_at is null) then raise exception 'Staff is not assigned to this Event.'; end if;
  if p_remaining_photo_capacity is null or p_remaining_photo_capacity<0 then raise exception 'Return count cannot be negative.'; end if;
  before_balance:=lot_row.remaining_photo_capacity;
  if p_remaining_photo_capacity>before_balance then raise exception 'Return count cannot exceed checkout balance.'; end if;
  delta:=p_remaining_photo_capacity-before_balance;
  if delta=0 then raise exception 'Return count must change the media balance.'; end if;
  select id,customer_id,orbit_event_id into project_row from public.projects where id=p_project_id;
  insert into public.inventory_movements(supply_id,customer_id,project_id,orbit_event_id,staff_id,movement_type,quantity,occurred_at,reason,created_by,updated_by,box_asset_id,printer_asset_id,media_lot_id,format_key,lot,quantity_before,quantity_delta,quantity_after,idempotency_key,portal_session_id)
  values(lot_row.supply_id,project_row.customer_id,p_project_id,project_row.orbit_event_id,resolved_staff_id,'EVENT_USAGE',delta,now(),coalesce(nullif(trim(p_note),''),'Staff media return'),actor_profile_id,actor_profile_id,lot_row.box_asset_id,lot_row.printer_asset_id,p_media_lot_id,lot_row.format_key,lot_row.lot,before_balance,delta,p_remaining_photo_capacity,p_idempotency_key,p_portal_session_id)
  returning id into movement_id;
  insert into public.asset_assignment_inspections(asset_assignment_id,component_asset_id,inspection_type,inspection_status,notes,incident_flag,idempotency_key,inspected_by,created_by,updated_by,staff_id,portal_session_id)
  values(assignment_id,lot_row.box_asset_id,'CHECK_IN',case when coalesce(p_incident_flag,false) then 'DAMAGED' else 'OK' end,nullif(trim(p_note),''),coalesce(p_incident_flag,false),p_idempotency_key||':media',actor_profile_id,actor_profile_id,actor_profile_id,resolved_staff_id,p_portal_session_id)
  on conflict(asset_assignment_id,inspection_type,component_asset_id) do nothing
  returning id into inspection_id;
  return jsonb_build_object('movement_id',movement_id,'duplicate',false,'before',before_balance,'delta',delta,'after',p_remaining_photo_capacity,'staff_id',resolved_staff_id,'portal_session_id',p_portal_session_id);
end $$;

create or replace function public.record_staff_box_check_out(
  p_project_id uuid,p_asset_assignment_id uuid,p_components jsonb,p_idempotency_key text,
  p_staff_id uuid,p_portal_session_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare item record; component jsonb; component_id uuid; resolved_staff_id uuid; actor_profile_id uuid; inspection_id uuid; result_count integer:=0;
begin
  select a.resolved_staff_id,a.profile_id into resolved_staff_id,actor_profile_id from public.resolve_phase_c_staff_portal_actor(p_staff_id,p_portal_session_id) a;
  if p_project_id is null or p_asset_assignment_id is null or nullif(trim(p_idempotency_key),'') is null then raise exception 'Datos de CHECK_OUT incompletos.'; end if;
  select a.id,a.asset_id,a.assignment_status into item
  from public.asset_assignments a
  join public.assignments sa on sa.project_id=a.project_id and sa.staff_id=resolved_staff_id and sa.deleted_at is null
    and sa.status in('CONFIRMED','ACCEPTED','COMPLETED') and sa.assignment_type in('OPERATOR','ASSEMBLY')
  where a.id=p_asset_assignment_id and a.project_id=p_project_id and a.deleted_at is null and a.assignment_status='ASSIGNED';
  if not found then raise exception 'Staff no autorizado para CHECK_OUT de esta Caja.'; end if;
  for component in select value from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) loop
    component_id:=(component->>'componentId')::uuid;
    if component->>'status' not in('OK','MISSING','DAMAGED','MAINTENANCE_REQUIRED') then raise exception 'Estado de componente inválido.'; end if;
    insert into public.asset_assignment_inspections(asset_assignment_id,component_asset_id,inspection_type,inspection_status,notes,incident_flag,idempotency_key,inspected_by,created_by,updated_by,staff_id,portal_session_id)
    values(item.id,component_id,'CHECK_OUT',component->>'status',nullif(trim(component->>'notes'),''),coalesce((component->>'incident')::boolean,false),p_idempotency_key||':'||component_id,actor_profile_id,actor_profile_id,actor_profile_id,resolved_staff_id,p_portal_session_id)
    on conflict(asset_assignment_id,inspection_type,component_asset_id) do nothing
    returning id into inspection_id;
    if inspection_id is not null then result_count:=result_count+1; end if;
  end loop;
  return jsonb_build_object('assignmentId',item.id,'inspectionType','CHECK_OUT','components',result_count,'duplicate',result_count=0,'staff_id',resolved_staff_id,'portal_session_id',p_portal_session_id);
end $$;

create or replace function public.record_staff_box_check_in(
  p_project_id uuid,p_asset_assignment_id uuid,p_media_lot_id uuid,p_remaining_photo_capacity numeric,
  p_components jsonb,p_note text,p_incident boolean,p_idempotency_key text,p_staff_id uuid,
  p_portal_session_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare item record; component jsonb; component_id uuid; movement_result jsonb; resolved_staff_id uuid; actor_profile_id uuid; inspection_id uuid; result_count integer:=0;
begin
  select a.resolved_staff_id,a.profile_id into resolved_staff_id,actor_profile_id from public.resolve_phase_c_staff_portal_actor(p_staff_id,p_portal_session_id) a;
  if p_project_id is null or p_asset_assignment_id is null or p_media_lot_id is null or nullif(trim(p_idempotency_key),'') is null then raise exception 'Datos de CHECK_IN incompletos.'; end if;
  select a.id,a.asset_id into item
  from public.asset_assignments a
  join public.assignments sa on sa.project_id=a.project_id and sa.staff_id=resolved_staff_id and sa.deleted_at is null
    and sa.status in('CONFIRMED','ACCEPTED','COMPLETED') and sa.assignment_type in('OPERATOR','DISASSEMBLY')
  where a.id=p_asset_assignment_id and a.project_id=p_project_id and a.deleted_at is null;
  if not found then raise exception 'Staff no autorizado para CHECK_IN de esta Caja.'; end if;
  select public.record_staff_box_media_return(p_project_id,p_media_lot_id,p_remaining_photo_capacity,p_note,p_incident,p_idempotency_key,resolved_staff_id,p_portal_session_id) into movement_result;
  for component in select value from jsonb_array_elements(coalesce(p_components,'[]'::jsonb)) loop
    component_id:=(component->>'componentId')::uuid;
    if component->>'status' not in('OK','MISSING','DAMAGED','MAINTENANCE_REQUIRED') then raise exception 'Estado de componente inválido.'; end if;
    insert into public.asset_assignment_inspections(asset_assignment_id,component_asset_id,inspection_type,inspection_status,notes,incident_flag,idempotency_key,inspected_by,created_by,updated_by,staff_id,portal_session_id)
    values(item.id,component_id,'CHECK_IN',component->>'status',nullif(trim(component->>'notes'),''),coalesce((component->>'incident')::boolean,false),p_idempotency_key||':'||component_id,actor_profile_id,actor_profile_id,actor_profile_id,resolved_staff_id,p_portal_session_id)
    on conflict(asset_assignment_id,inspection_type,component_asset_id) do nothing
    returning id into inspection_id;
    if inspection_id is not null then result_count:=result_count+1; end if;
  end loop;
  update public.asset_assignments set assignment_status='RETURNED',return_condition=case when p_incident then 'REQUIRES_REVIEW' else 'OK' end,return_notes=nullif(trim(p_note),''),return_confirmed_by=actor_profile_id,return_confirmed_at=now(),returned_at=coalesce(returned_at,now()),updated_by=actor_profile_id where id=item.id;
  update public.operational_assets set status=case when p_incident then 'MAINTENANCE' else 'AVAILABLE' end,updated_by=actor_profile_id where id=item.asset_id;
  if p_incident then
    insert into public.event_incidents(project_id,asset_id,asset_assignment_id,incident_type,severity,status,description,created_by,staff_id,portal_session_id)
    values(p_project_id,item.asset_id,item.id,'EQUIPMENT','HIGH','OPEN',coalesce(nullif(trim(p_note),''),'Incidente operacional informado por Staff.'),actor_profile_id,resolved_staff_id,p_portal_session_id)
    on conflict(asset_assignment_id,incident_type) do update set status='OPEN',severity='HIGH',description=excluded.description,staff_id=excluded.staff_id,portal_session_id=excluded.portal_session_id,updated_at=now();
  end if;
  return jsonb_build_object('assignmentId',item.id,'movement',movement_result,'components',result_count,'reviewRequired',p_incident,'staff_id',resolved_staff_id,'portal_session_id',p_portal_session_id);
end $$;

revoke all on function public.resolve_phase_c_staff_portal_actor(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.record_staff_box_media_return(uuid,uuid,numeric,text,boolean,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.record_staff_box_check_out(uuid,uuid,jsonb,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.record_staff_box_check_in(uuid,uuid,uuid,numeric,jsonb,text,boolean,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.resolve_phase_c_staff_portal_actor(uuid,uuid) to service_role;
grant execute on function public.record_staff_box_media_return(uuid,uuid,numeric,text,boolean,text,uuid,uuid) to service_role;
grant execute on function public.record_staff_box_check_out(uuid,uuid,jsonb,text,uuid,uuid) to service_role;
grant execute on function public.record_staff_box_check_in(uuid,uuid,uuid,numeric,jsonb,text,boolean,text,uuid,uuid) to service_role;

-- The pre-C.4B five-argument/eight-argument RPCs accepted a caller-supplied
-- staff_id without a portal session. They remain in the catalog for rollback
-- compatibility but are no longer executable by the application role.
revoke all on function public.record_staff_box_check_out(uuid,uuid,jsonb,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.record_staff_box_check_in(uuid,uuid,uuid,numeric,jsonb,text,boolean,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.record_staff_box_media_return(uuid,uuid,numeric,text,boolean,text,uuid) from public,anon,authenticated,service_role;

commit;
