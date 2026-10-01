begin;

update public.commercial_prices
set
  unit_price = 25000,
  pricing_status = 'DEFINED',
  approval_reason = 'Actualización comercial 2026-09-30: Provincia de Santiago $25.000',
  updated_at = now()
where category = 'TRANSPORT'
  and code = 'SANTIAGO_PROVINCE'
  and deleted_at is null;

commit;
