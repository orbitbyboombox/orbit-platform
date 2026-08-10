begin;

alter table public.operational_assets drop constraint if exists operational_assets_asset_type_check;
alter table public.operational_assets add constraint operational_assets_asset_type_check check (asset_type in (
  'TOTEM','CASE','VEHICLE','CLASSIC_TOTEM','BLACK_STUDIO','BBOX360','LIGHTBOX','BOOMBALL','PRINTER','CAMERA','LIGHT','ACCESSORY'
));

alter table public.operational_assets drop constraint if exists operational_assets_status_check;
alter table public.operational_assets add constraint operational_assets_status_check check (status in (
  'AVAILABLE','ASSIGNED','IN_EVENT','MAINTENANCE','OUT_OF_SERVICE'
));

commit;
