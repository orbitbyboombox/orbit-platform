begin;

-- Global paper-cost reconciliation.
-- The canonical stock unit is the quantity stored by event_paper_snapshots
-- (photos available). A closed snapshot is the event-level usage ledger;
-- inventory_movements remains the lot-level ledger when a physical lot exists.

create or replace function public.resolve_paper_unit_cost(p_format_key text)
returns table(unit_cost numeric, source text, review_required boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized text;
  exact_count integer;
  generic_count integer;
  exact_amount numeric;
  generic_amount numeric;
begin
  normalized := upper(regexp_replace(coalesce(nullif(trim(p_format_key), ''), 'UNKNOWN'), '[^A-Z0-9]+', '_', 'g'));

  select count(*), max(amount)
    into exact_count, exact_amount
  from public.cost_master_entries
  where enabled
    and deleted_at is null
    and (
      code in ('PAPER_COST_' || normalized, 'COST_PER_PHOTO_' || normalized)
      or upper(coalesce(metadata->>'formatKey', metadata->>'format_key', metadata->>'format', '')) = normalized
    );

  if exact_count = 1 then
    return query select round(exact_amount, 6), 'FORMAT_SPECIFIC', false;
    return;
  end if;

  if exact_count > 1 then
    return query select null::numeric, 'AMBIGUOUS_FORMAT_COST', true;
    return;
  end if;

  select count(*), max(amount)
    into generic_count, generic_amount
  from public.cost_master_entries
  where code = 'COST_PER_PHOTO'
    and enabled
    and deleted_at is null;

  if generic_count = 1 then
    return query select round(generic_amount, 6), 'GENERIC_COST_PER_PHOTO', false;
    return;
  end if;

  return query select null::numeric, 'MISSING_COST_PER_PHOTO', true;
end;
$$;

create or replace function public.calculate_event_paper_cost(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  paper_row record;
  unit_row record;
  total_usage numeric := 0;
  total_cost numeric := 0;
  review_required boolean := false;
  format_details jsonb := '[]'::jsonb;
begin
  for paper_row in
    select coalesce(nullif(trim(format_key), ''), nullif(trim(black_box_paper_format), ''), 'UNKNOWN') as format_key,
           coalesce(sum(event_usage), 0) as usage,
           count(*) as snapshot_count
    from public.event_paper_snapshots
    where project_id = p_project_id
      and status in ('CONFIRMED', 'OVERRIDDEN')
      and event_usage is not null
    group by 1
  loop
    select * into unit_row
    from public.resolve_paper_unit_cost(paper_row.format_key)
    limit 1;

    total_usage := total_usage + paper_row.usage;
    review_required := review_required or coalesce(unit_row.review_required, true);
    if not coalesce(unit_row.review_required, true) then
      total_cost := total_cost + paper_row.usage * unit_row.unit_cost;
    end if;

    format_details := format_details || jsonb_build_array(jsonb_build_object(
      'format', paper_row.format_key,
      'usage', paper_row.usage,
      'snapshots', paper_row.snapshot_count,
      'unitCost', unit_row.unit_cost,
      'source', unit_row.source,
      'reviewRequired', unit_row.review_required
    ));
  end loop;

  return jsonb_build_object(
    'unit', 'PHOTOS',
    'usage', total_usage,
    'totalCost', case when review_required then null else round(total_cost, 2) end,
    'reviewRequired', review_required,
    'formats', format_details,
    'source', 'EVENT_PAPER_SNAPSHOTS_AND_COST_MASTER'
  );
end;
$$;

create or replace function public.sync_event_paper_cost_financials(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  paper jsonb;
  truth public.financial_event_records%rowtype;
  old_paper numeric := 0;
  new_paper numeric;
  next_resources numeric;
  next_total numeric;
  next_profit numeric;
  next_margin numeric;
begin
  paper := public.calculate_event_paper_cost(p_project_id);
  if coalesce((paper->>'reviewRequired')::boolean, true) then
    return jsonb_build_object('updated', false, 'reviewRequired', true, 'paper', paper);
  end if;

  select * into truth
  from public.financial_event_records
  where project_id = p_project_id
  for update;
  if not found then
    return jsonb_build_object('updated', false, 'reason', 'NO_FINANCIAL_RECORD');
  end if;

  new_paper := coalesce((paper->>'totalCost')::numeric, 0);
  old_paper := coalesce((truth.cost_breakdown->>'paper')::numeric, 0);
  next_resources := round(coalesce(truth.operational_resources_cost, 0) - old_paper + new_paper, 2);
  next_total := round(coalesce(truth.personnel_cost, 0) + next_resources, 2);
  next_profit := round(coalesce(truth.revenue, 0) - next_total, 2);
  next_margin := case when coalesce(truth.revenue, 0) = 0 then 0 else next_profit / truth.revenue * 100 end;

  if abs(old_paper - new_paper) > 0.01 then
    insert into public.audit_events(entity_type, entity_id, action, reason, previous_state, new_state, orbit_event_id)
    values(
      'PAPER_COST_RECONCILIATION', p_project_id::text, 'SYNCED',
      'Costo de papel recalculado desde consumo confirmado y costo unitario vigente.',
      jsonb_build_object('paperCost', old_paper, 'totalOperationalCost', truth.total_operational_cost),
      jsonb_build_object('paperCost', new_paper, 'paper', paper, 'totalOperationalCost', next_total),
      truth.orbit_event_id
    );
  end if;

  update public.financial_event_records
  set operational_resources_cost = next_resources,
      total_operational_cost = next_total,
      real_cost = next_total,
      gross_profit = next_profit,
      net_profit = next_profit,
      gross_margin = next_margin,
      net_margin = next_margin,
      cost_breakdown = coalesce(truth.cost_breakdown, '{}'::jsonb)
        || jsonb_build_object(
          'paper', new_paper,
          'paperUsage', (paper->>'usage')::numeric,
          'paperUnit', paper->>'unit',
          'paperCostStatus', 'CONFIRMED',
          'paperCostSource', paper->>'source',
          'paperFormats', paper->'formats'
        ),
      calculated_at = now(),
      updated_at = now(),
      version = version + 1
  where project_id = p_project_id;

  return jsonb_build_object('updated', true, 'reviewRequired', false, 'paper', paper, 'totalOperationalCost', next_total);
end;
$$;

-- Rebuild the operational cost from confirmed evidence. Paper uses the
-- format-aware paper projection above when a confirmed snapshot exists, while
-- the current quote and Cost Master define Branding production cost. Staff is
-- kept on the canonical payment/override projection.
create or replace function public.sync_event_operation_cost(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate public.estimated_cost_sheets%rowtype;
  truth public.financial_event_records%rowtype;
  staff record;
  paper jsonb;
  paper_value numeric;
  confirmed_paper_snapshots integer := 0;
  branding_faces_value numeric := 0;
  branding_quote_found boolean := false;
  branding_unit_cost numeric;
  branding_value numeric := 0;
  real_operator numeric;
  real_assembly numeric;
  real_disassembly numeric;
  real_fuel numeric;
  real_transport numeric;
  real_scrapbook numeric;
  real_magnets numeric;
  real_other numeric := 0;
  operator_value numeric;
  assembly_value numeric;
  disassembly_value numeric;
  fuel_value numeric;
  transport_value numeric;
  scrapbook_value numeric;
  magnets_value numeric;
  other_value numeric;
  expense_net numeric := 0;
  staff_net numeric;
  staff_tax numeric;
  personnel numeric;
  resources numeric;
  total_value numeric;
  profit_value numeric;
  margin_value numeric;
  estimated_tax numeric;
  breakdown jsonb;
begin
  select * into estimate from public.estimated_cost_sheets where project_id = p_project_id;
  select * into truth from public.financial_event_records where project_id = p_project_id;
  if not found or estimate.id is null then return; end if;

  select count(*)::integer into confirmed_paper_snapshots
  from public.event_paper_snapshots
  where project_id = p_project_id
    and paper_required
    and status in ('CONFIRMED', 'OVERRIDDEN');

  paper := public.calculate_event_paper_cost(p_project_id);
  if confirmed_paper_snapshots > 0 then
    if coalesce((paper->>'reviewRequired')::boolean, true) then
      return;
    end if;
    paper_value := coalesce((paper->>'totalCost')::numeric, 0);
  else
    paper_value := coalesce(estimate.paper, 0);
  end if;

  select coalesce(sum(qi.quantity), 0), count(*) > 0
  into branding_faces_value, branding_quote_found
  from public.quotations q
  join public.quotation_items qi on qi.quotation_id = q.id
  where q.project_id = p_project_id
    and q.status in ('ACCEPTED', 'CONVERTED')
    and q.deleted_at is null
    and upper(qi.code) = 'BRANDING'
    and q.id = (
      select q2.id from public.quotations q2
      where q2.project_id = p_project_id
        and q2.status in ('ACCEPTED', 'CONVERTED')
        and q2.deleted_at is null
      order by q2.approved_at desc nulls last, q2.created_at desc
      limit 1
    );
  if not branding_quote_found then
    branding_faces_value := coalesce(public.event_branding_faces(p_project_id), 0);
  end if;

  select amount into branding_unit_cost
  from public.cost_master_entries
  where code = 'BRANDING_FACE' and enabled and deleted_at is null
  order by version desc, updated_at desc limit 1;
  if branding_faces_value > 0 and branding_unit_cost is null then
    return;
  end if;
  branding_value := branding_faces_value * coalesce(branding_unit_cost, 0);

  select * into staff from public.event_staff_payment_role_totals(p_project_id);
  select edited_value into real_operator from public.financial_cost_overrides where project_id=p_project_id and category='OPERATOR' order by created_at desc limit 1;
  select edited_value into real_assembly from public.financial_cost_overrides where project_id=p_project_id and category='ASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_disassembly from public.financial_cost_overrides where project_id=p_project_id and category='DISASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_fuel from public.financial_cost_overrides where project_id=p_project_id and category='FUEL' order by created_at desc limit 1;
  select edited_value into real_transport from public.financial_cost_overrides where project_id=p_project_id and category='TRANSPORT' order by created_at desc limit 1;
  select edited_value into real_scrapbook from public.financial_cost_overrides where project_id=p_project_id and category='SCRAPBOOK' order by created_at desc limit 1;
  select edited_value into real_magnets from public.financial_cost_overrides where project_id=p_project_id and category='MAGNETS' order by created_at desc limit 1;
  select coalesce(sum(edited_value),0) into real_other from (
    select distinct on(category) category, edited_value
    from public.financial_cost_overrides
    where project_id=p_project_id and category in('PARKING','TOLLS','MEALS','HOTEL','OTHER_OPERATIONAL','MISCELLANEOUS')
    order by category, created_at desc
  ) latest;
  select coalesce(sum(subtotal),0) into expense_net from public.expenses where project_id=p_project_id and deleted_at is null and status <> 'CANCELLED';

  operator_value := coalesce(real_operator, case when staff.payment_rows > 0 then staff.operator end, estimate.operator);
  assembly_value := coalesce(real_assembly, case when staff.payment_rows > 0 then staff.assembly end, estimate.assembly);
  disassembly_value := coalesce(real_disassembly, case when staff.payment_rows > 0 then staff.disassembly end, estimate.disassembly);
  fuel_value := coalesce(real_fuel, estimate.fuel);
  transport_value := coalesce(real_transport, estimate.transport);
  scrapbook_value := coalesce(real_scrapbook, estimate.scrapbook);
  magnets_value := coalesce(real_magnets, estimate.magnets);
  other_value := estimate.other_configured + real_other;
  staff_net := operator_value + assembly_value + disassembly_value + staff.adjustments;
  staff_tax := public.staff_company_cost_from_net(staff_net) - staff_net;
  personnel := staff_net + staff_tax;
  resources := paper_value + fuel_value + transport_value + scrapbook_value + magnets_value + branding_value + estimate.pens + estimate.double_sided_tape + other_value + expense_net;
  total_value := case when truth.status='CANCELLED' then 0 else personnel + resources end;
  profit_value := case when truth.status='CANCELLED' then 0 else truth.revenue - total_value end;
  margin_value := case when truth.revenue=0 then 0 else profit_value / truth.revenue * 100 end;
  estimated_tax := public.staff_company_cost_from_net(estimate.operator + estimate.assembly + estimate.disassembly) - (estimate.operator + estimate.assembly + estimate.disassembly);
  breakdown := jsonb_build_object(
    'personnelCost',personnel,'operator',operator_value,'assembly',assembly_value,'disassembly',disassembly_value,
    'staffAdjustments',staff.adjustments,'staffTax',staff_tax,'staffTaxRate',public.staff_withholding_rate()*100,
    'operationalResourcesCost',resources,'paper',paper_value,
    'paperSource',case when confirmed_paper_snapshots > 0 then paper->>'source' else 'ESTIMATED_COST_SHEET_FALLBACK' end,
    'paperUsage',coalesce((paper->>'usage')::numeric,0),'paperUnitCost',case when confirmed_paper_snapshots > 0 then nullif((paper->'formats'->0->>'unitCost'),'')::numeric end,
    'confirmedPaperSnapshots',confirmed_paper_snapshots,'fuel',fuel_value,'transport',transport_value,'scrapbook',scrapbook_value,'magnets',magnets_value,
    'branding',branding_value,'brandingSource',case when branding_quote_found then 'CURRENT_QUOTATION_ITEM' else 'EVENT_BRANDING_FACES_COMPATIBILITY_FALLBACK' end,
    'brandingFaces',branding_faces_value,'brandingUnitCost',branding_unit_cost,'pens',estimate.pens,'doubleSidedTape',estimate.double_sided_tape,
    'other',other_value,'registeredExpenses',expense_net,'totalOperationalCost',total_value,'staffPaymentRows',staff.payment_rows,
    'source','CANONICAL_CONFIRMED_PAPER_QUOTE_BRANDING_STAFF_V1'
  );
  update public.financial_event_records set
    personnel_cost=case when status='CANCELLED' then 0 else personnel end,
    operational_resources_cost=case when status='CANCELLED' then 0 else resources end,
    total_operational_cost=total_value,
    estimated_cost=case when status='CANCELLED' then 0 else estimate.total+estimated_tax end,
    real_cost=total_value,gross_profit=profit_value,net_profit=profit_value,gross_margin=margin_value,net_margin=margin_value,
    cost_breakdown=breakdown,calculated_at=now(),updated_at=now(),version=version+1
  where project_id=p_project_id;
end;
$$;

revoke all on function public.sync_event_operation_cost(uuid) from public, anon;
grant execute on function public.sync_event_operation_cost(uuid) to authenticated, service_role;

-- Keep the existing closeout transaction and extend its post-close writer with
-- the paper-cost reconciliation. Any exception rolls back the whole close.
create or replace function public.sync_profitability_after_paper_closeout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null
     and new.status in ('CONFIRMED', 'OVERRIDDEN')
     and new.event_usage is not null
     and (
       old.status is distinct from new.status
       or old.event_usage is distinct from new.event_usage
       or old.final_remaining_balance is distinct from new.final_remaining_balance
     ) then
    perform public.sync_event_operation_cost(new.project_id);
    perform public.sync_event_paper_cost_financials(new.project_id);
  end if;
  return new;
end;
$$;

revoke all on function public.resolve_paper_unit_cost(text) from public, anon, authenticated;
revoke all on function public.calculate_event_paper_cost(uuid) from public, anon, authenticated;
revoke all on function public.sync_event_paper_cost_financials(uuid) from public, anon, authenticated;
grant execute on function public.resolve_paper_unit_cost(text) to service_role;
grant execute on function public.calculate_event_paper_cost(uuid) to service_role;
grant execute on function public.sync_event_paper_cost_financials(uuid) to service_role;

-- Reconcile only events with confirmed/overridden paper usage. This is
-- idempotent: rerunning it produces no new movement and no duplicate ledger.
do $$
declare
  item record;
begin
  for item in
    select distinct project_id
    from public.event_paper_snapshots
    where status in ('CONFIRMED', 'OVERRIDDEN')
      and event_usage is not null
  loop
    perform public.sync_event_operation_cost(item.project_id);
    perform public.sync_event_paper_cost_financials(item.project_id);
  end loop;
end;
$$;

commit;
