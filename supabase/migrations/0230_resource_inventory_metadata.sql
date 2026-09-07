-- Resource Manager extension: optional physical inventory metadata.
-- Additive and idempotent. Does not alter or delete existing records.
alter table public.operational_assets
  add column if not exists serial_number text,
  add column if not exists storage_location text,
  add column if not exists notes text,
  add column if not exists manufacturer text,
  add column if not exists model text;

alter table public.operational_assets drop constraint if exists operational_assets_storage_location_check;
alter table public.operational_assets add constraint operational_assets_storage_location_check
  check (storage_location is null or storage_location in ('BODEGA','TALLER','EN_EVENTO','MANTENIMIENTO','OTRA'));

alter table public.asset_history drop constraint if exists asset_history_history_type_check;
alter table public.asset_history add constraint asset_history_history_type_check check (history_type in (
  'OPERATION','MAINTENANCE','INCIDENT','CLEANING','STATUS_CHANGE','WAREHOUSE_CHECKOUT','WAREHOUSE_RETURN',
  'ASSIGNED','RELEASED','RETURNED','LOCATION_CHANGED'
));

create index if not exists operational_assets_serial_number_idx
  on public.operational_assets(serial_number) where deleted_at is null and serial_number is not null;
create index if not exists operational_assets_storage_location_idx
  on public.operational_assets(storage_location) where deleted_at is null;
