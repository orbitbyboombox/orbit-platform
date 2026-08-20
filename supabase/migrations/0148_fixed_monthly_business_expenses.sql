begin;

-- Canonical company overhead uses the existing recurring finance engine. These
-- rules are not project expenses and installation does not generate expense runs.
insert into public.finance_recurring_expense_rules(
  name, provider, category, amount, currency, frequency, due_day,
  next_due_date, active, metadata
)
select seed.name, seed.provider, seed.category, seed.amount, 'CLP', 'MONTHLY',
  seed.due_day, seed.next_due_date, true, seed.metadata
from (values
  (
    'Dividendo Oficina + Bodega', 'BOOMBOX',
    'INFRASTRUCTURE_OWNED_PROPERTY_DIVIDEND', 505000::numeric, 1,
    date '2026-08-01',
    jsonb_build_object(
      'source', 'FOUNDER_FIXED_EXPENSES_2026_08',
      'costScope', 'BUSINESS_OVERHEAD',
      'fixedExpense', true,
      'eventCostImpact', false,
      'cashFlowImpact', true,
      'operatingResultImpact', true,
      'effectiveStart', '2026-08-01',
      'classification', jsonb_build_object(
        'level1', 'INFRASTRUCTURE',
        'level2', 'OWNED_PROPERTY',
        'level3', 'DIVIDEND'
      ),
      'notes', 'Inmueble propio BOOMBOX. Salida operativa de caja; no corresponde a arriendo.'
    )
  ),
  (
    'Gastos comunes', 'BOOMBOX', 'FACILITY_COMMON_EXPENSES', 124000::numeric, 5,
    date '2026-08-05',
    jsonb_build_object('source','FOUNDER_FIXED_EXPENSES_2026_08','costScope','BUSINESS_OVERHEAD','fixedExpense',true,'eventCostImpact',false,'cashFlowImpact',true,'operatingResultImpact',true,'effectiveStart','2026-08-01','classification',jsonb_build_object('level1','INFRASTRUCTURE','level2','COMMON_EXPENSES'))
  ),
  (
    'Luz', 'BOOMBOX', 'UTILITIES_ELECTRICITY', 15000::numeric, 10,
    date '2026-08-10',
    jsonb_build_object('source','FOUNDER_FIXED_EXPENSES_2026_08','costScope','BUSINESS_OVERHEAD','fixedExpense',true,'eventCostImpact',false,'cashFlowImpact',true,'operatingResultImpact',true,'effectiveStart','2026-08-01','classification',jsonb_build_object('level1','UTILITIES','level2','ELECTRICITY'))
  ),
  (
    'Agua', 'BOOMBOX', 'UTILITIES_WATER', 6000::numeric, 10,
    date '2026-08-10',
    jsonb_build_object('source','FOUNDER_FIXED_EXPENSES_2026_08','costScope','BUSINESS_OVERHEAD','fixedExpense',true,'eventCostImpact',false,'cashFlowImpact',true,'operatingResultImpact',true,'effectiveStart','2026-08-01','classification',jsonb_build_object('level1','UTILITIES','level2','WATER'))
  )
) as seed(name, provider, category, amount, due_day, next_due_date, metadata)
where not exists (
  select 1
  from public.finance_recurring_expense_rules existing
  where lower(existing.name) = lower(seed.name)
    and existing.active
);

commit;
