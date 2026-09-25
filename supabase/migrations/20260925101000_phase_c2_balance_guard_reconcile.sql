begin;

-- C.2 reconciliation: service-role RPCs validate the supplied actor directly;
-- the app still authorizes the actor before invoking them. Media history stays
-- immutable and every insert synchronizes the lot balance atomically.
create or replace function public.apply_box_media_movement(
  p_media_lot_id uuid,p_movement_type text,p_quantity_delta numeric,p_occurred_at timestamptz,
  p_reason text,p_project_id uuid default null,p_orbit_event_id text default null,
  p_staff_id uuid default null,p_actor_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare lot_row public.box_media_lots%rowtype; movement_id uuid; actor uuid:=p_actor_id;
begin
  if actor is null or not exists (select 1 from public.profiles where id=actor and role in ('CEO'::orbit_role,'ADMINISTRATOR'::orbit_role)) then raise exception 'Administrative access required.'; end if;
  if p_quantity_delta=0 then raise exception 'Media movement cannot be zero.'; end if;
  select * into lot_row from public.box_media_lots where id=p_media_lot_id and status<>'DISCARDED' for update;
  if not found then raise exception 'Media lot not found.'; end if;
  insert into public.inventory_movements(
    supply_id,orbit_event_id,project_id,staff_id,movement_type,quantity,occurred_at,reason,
    created_by,updated_by,box_asset_id,printer_asset_id,media_lot_id,format_key,lot,
    quantity_before,quantity_delta,quantity_after
  ) values(
    lot_row.supply_id,p_orbit_event_id,p_project_id,p_staff_id,p_movement_type,p_quantity_delta,coalesce(p_occurred_at,now()),p_reason,
    actor,actor,lot_row.box_asset_id,lot_row.printer_asset_id,p_media_lot_id,lot_row.format_key,lot_row.lot,
    lot_row.remaining_photo_capacity,p_quantity_delta,lot_row.remaining_photo_capacity+p_quantity_delta
  ) returning id into movement_id;
  return movement_id;
end $$;

create or replace function public.create_box_media_lot_with_load(
  p_supply_id uuid,p_box_asset_id uuid,p_printer_asset_id uuid,p_format_key text,p_lot text,
  p_loaded_at timestamptz,p_initial_capacity numeric,p_low_stock_threshold numeric,
  p_notes text,p_actor_id uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare lot_id uuid; actor uuid:=p_actor_id;
begin
  if actor is null or not exists (select 1 from public.profiles where id=actor and role in ('CEO'::orbit_role,'ADMINISTRATOR'::orbit_role)) then raise exception 'Administrative access required.'; end if;
  insert into public.box_media_lots(
    supply_id,box_asset_id,printer_asset_id,format_key,lot,loaded_at,initial_photo_capacity,
    remaining_photo_capacity,low_stock_threshold,notes,created_by,updated_by
  ) values(
    p_supply_id,p_box_asset_id,p_printer_asset_id,p_format_key,p_lot,coalesce(p_loaded_at,now()),
    p_initial_capacity,0,coalesce(p_low_stock_threshold,100),p_notes,actor,actor
  ) returning id into lot_id;
  perform public.apply_box_media_movement(lot_id,'LOAD',p_initial_capacity,coalesce(p_loaded_at,now()),'Initial media load',null,null,null,actor);
  return lot_id;
end $$;

commit;
