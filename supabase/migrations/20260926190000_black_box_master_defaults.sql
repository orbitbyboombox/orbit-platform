-- Phase 1: Master Admin defaults for the nine operational black boxes.
-- Uses the existing operational_assets metadata and audit/version triggers.
-- CASE-10..12 remain outside the operational Master by design.
begin;

update public.operational_assets
set metadata = coalesce(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'blackBoxPhotoStock', coalesce(metadata->'blackBoxPhotoStock', '0'::jsonb),
    'blackBoxPaperFormat', coalesce(metadata->'blackBoxPaperFormat', '"4X6"'::jsonb)
  )
where asset_type='CASE'
  and asset_code in ('CASE-01','CASE-02','CASE-03','CASE-04','CASE-05','CASE-06','CASE-07','CASE-08','CASE-09')
  and deleted_at is null;

commit;
