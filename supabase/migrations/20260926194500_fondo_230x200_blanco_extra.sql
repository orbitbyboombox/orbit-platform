begin;

-- Forward-only commercial catalog addition. Existing prices and historical
-- quotation snapshots remain unchanged.
insert into public.commercial_prices(
  category, code, label, duration_hours, destination, unit_price, currency,
  pricing_status, vat_exclusive, rules, version, approval_reason, enabled,
  display_order, metadata
)
select
  'EXTRA',
  'BACKDROP_230X200_WHITE',
  'FONDO 230X200 BLANCO',
  null,
  null,
  65000,
  'CLP',
  'DEFINED',
  false,
  '{}'::jsonb,
  1,
  'Nuevo extra comercial BOOMBOX · FONDO 230X200 BLANCO',
  true,
  25,
  jsonb_build_object('description', 'Fondo blanco de 230 x 200 cm para complementar el servicio fotográfico.')
where not exists (
  select 1 from public.commercial_prices
  where category = 'EXTRA' and code = 'BACKDROP_230X200_WHITE'
);

update public.commercial_prices
set label = 'FONDO 230X200 BLANCO',
    unit_price = 65000,
    currency = 'CLP',
    pricing_status = 'DEFINED',
    vat_exclusive = false,
    enabled = true,
    deleted_at = null,
    approval_reason = 'Nuevo extra comercial BOOMBOX · FONDO 230X200 BLANCO',
    updated_at = now()
where category = 'EXTRA' and code = 'BACKDROP_230X200_WHITE';

-- Make the new extra selectable for every active service without changing
-- existing service compatibility or historical reservations.
update public.master_data_entries
set configuration = jsonb_set(
  coalesce(configuration, '{}'::jsonb),
  '{compatibleExtras}',
  coalesce(configuration->'compatibleExtras', '[]'::jsonb) || '["BACKDROP_230X200_WHITE"]'::jsonb,
  true
),
updated_at = now(),
approval_reason = 'Nuevo extra comercial BOOMBOX disponible para todos los servicios'
where domain = 'SERVICES'
  and enabled
  and not (coalesce(configuration->'compatibleExtras', '[]'::jsonb) ? 'BACKDROP_230X200_WHITE');

commit;
