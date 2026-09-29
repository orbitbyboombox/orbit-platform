begin;

-- Catalog extra intentionally priced at zero. It remains selectable and visible
-- in post-reservation flows; zero must not be treated as missing pricing.
insert into public.commercial_prices(
  category, code, label, duration_hours, destination, unit_price, currency,
  pricing_status, vat_exclusive, rules, version, approval_reason, enabled,
  display_order, metadata
)
select
  'EXTRA',
  'IMANES_BOOMBOX',
  'IMANES BOOMBOX',
  null,
  null,
  0,
  'CLP',
  'DEFINED',
  false,
  '{}'::jsonb,
  1,
  'Extra de catálogo BOOMBOX sin costo adicional · IMANES BOOMBOX',
  true,
  26,
  jsonb_build_object('description', 'Imanes BOOMBOX incluidos sin costo adicional.')
where not exists (
  select 1 from public.commercial_prices
  where category = 'EXTRA' and code = 'IMANES_BOOMBOX'
);

update public.commercial_prices
set label = 'IMANES BOOMBOX',
    unit_price = 0,
    currency = 'CLP',
    pricing_status = 'DEFINED',
    vat_exclusive = false,
    enabled = true,
    deleted_at = null,
    approval_reason = 'Extra de catálogo BOOMBOX sin costo adicional · IMANES BOOMBOX',
    updated_at = now()
where category = 'EXTRA' and code = 'IMANES_BOOMBOX';

commit;
