begin;

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
  select * into lot_row from public.box_media_lots l where l.id=p_media_lot_id and l.status<>'DISCARDED' for update;
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

commit;
