begin;

-- Trigger helpers are not API endpoints. Keep them callable by PostgreSQL
-- trigger execution only; the two application RPCs remain service_role-only.
revoke all on function public.box_media_lot_asset_guard() from public,anon,authenticated;
revoke all on function public.box_media_movement_guard() from public,anon,authenticated;
revoke all on function public.box_media_movement_immutable() from public,anon,authenticated;
revoke all on function public.sync_box_media_lot_balance() from public,anon,authenticated;
revoke all on function public.record_inventory_timeline() from public,anon,authenticated;
revoke all on function public.refresh_supply_stock() from public,anon,authenticated;
revoke all on function public.apply_box_media_movement(uuid,text,numeric,timestamptz,text,uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.create_box_media_lot_with_load(uuid,uuid,uuid,text,text,timestamptz,numeric,numeric,text,uuid) from public,anon,authenticated;
grant execute on function public.apply_box_media_movement(uuid,text,numeric,timestamptz,text,uuid,text,uuid,uuid) to service_role;
grant execute on function public.create_box_media_lot_with_load(uuid,uuid,uuid,text,text,timestamptz,numeric,numeric,text,uuid) to service_role;

commit;
