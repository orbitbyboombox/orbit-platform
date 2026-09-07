-- Canonical commercial model: CASE is the complete technical kit.
-- Idempotent, additive/reconciling, and never deletes records or assignments.
begin;

alter table public.operational_assets drop constraint if exists operational_assets_asset_type_check;
alter table public.operational_assets add constraint operational_assets_asset_type_check check (asset_type in (
  'TOTEM','CASE','VEHICLE','CLASSIC_TOTEM','BLACK_STUDIO','BBOX360','LIGHTBOX','BOOMBALL','PRINTER','CAMERA','LIGHT','ACCESSORY','DISPLAY_22'
));

-- Mapping synchronization invokes readiness for every historical confirmed
-- project; some old projects lack an operational contract. The mapping change
-- itself is still safe, so suspend only that trigger and reconcile requirements
-- explicitly below.
alter table public.service_asset_type_mappings disable trigger service_asset_mapping_sync;

-- Keep the existing mapping rows but change their canonical resource from the
-- former carcass interpretation to the complete CASE kit.
update public.service_asset_type_mappings
set asset_type='CASE', units_per_service=1, enabled=true, updated_at=now()
where service_code in ('CLASSIC','BLACK_STUDIO')
  and asset_type='TOTEM';

insert into public.service_asset_type_mappings(service_code,asset_type,units_per_service,enabled)
select service_code,'CASE',1,true
from (values ('POLAROID'),('INSTABOX')) as services(service_code)
where not exists (
  select 1 from public.service_asset_type_mappings mapping
  where mapping.service_code=services.service_code and mapping.asset_type='CASE'
);

alter table public.service_asset_type_mappings enable trigger service_asset_mapping_sync;

-- Existing active physical requirements for these services must use CASE too,
-- otherwise the old TOTEM requirement would double-count the kit.
update public.event_operational_requirements requirement
set asset_type='CASE',
    mapping_id=mapping.id,
    updated_at=now()
from public.service_asset_type_mappings mapping
where mapping.service_code=requirement.code
  and mapping.asset_type='CASE'
  and requirement.status='ACTIVE'
  and requirement.requirement_type='PHYSICAL_UNIT'
  and requirement.code in ('CLASSIC','POLAROID','BLACK_STUDIO','INSTABOX');

-- Founder-confirmed independent stock: six lateral 22-inch displays and two
-- BBOX360 platforms. Do not create incoming touch backup or IA equipment here.
insert into public.operational_assets(asset_code,asset_type,status,qr_key,metadata)
select code,asset_type,'AVAILABLE','orbit:asset:'||code,
       jsonb_build_object('name',display_name,'resourceCategory','EQUIPMENT','inventorySource','FOUNDER_CONFIRMED')
from (values
  ('DISPLAY22-01','DISPLAY_22','Display lateral 22"'),('DISPLAY22-02','DISPLAY_22','Display lateral 22"'),
  ('DISPLAY22-03','DISPLAY_22','Display lateral 22"'),('DISPLAY22-04','DISPLAY_22','Display lateral 22"'),
  ('DISPLAY22-05','DISPLAY_22','Display lateral 22"'),('DISPLAY22-06','DISPLAY_22','Display lateral 22"'),
  ('360-01','BBOX360','Plataforma 360'),('360-02','BBOX360','Plataforma 360')
) as confirmed(code,asset_type,display_name)
where not exists (select 1 from public.operational_assets asset where asset.asset_code=confirmed.code);

commit;
