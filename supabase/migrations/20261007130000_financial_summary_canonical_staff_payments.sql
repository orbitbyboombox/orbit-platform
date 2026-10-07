begin;

-- The event profitability projection must consume the same canonical Staff
-- payment rows used by Staff Finance. ESTIMATED rows are valid projected costs;
-- only cancelled/deleted rows are excluded. Role overrides always win.
create or replace function public.event_staff_payment_role_totals(p_project_id uuid)
returns table(operator numeric, assembly numeric, disassembly numeric, adjustments numeric, payment_rows integer)
language sql stable security definer set search_path=public as $$
  select
    coalesce(sum(coalesce(p.override_operator_payment, p.operator_payment, 0)), 0),
    coalesce(sum(coalesce(p.override_assembly_payment, p.assembly_payment, 0)), 0),
    coalesce(sum(coalesce(p.override_disassembly_payment, p.disassembly_payment, 0)), 0),
    coalesce((select sum(a.amount) from public.event_staff_settlement_adjustments a join public.event_staff_payments ap on ap.id=a.settlement_id where ap.project_id=p_project_id and ap.deleted_at is null and ap.status <> 'CANCELLED'), 0),
    count(*)::integer
  from public.event_staff_payments p
  where p.project_id=p_project_id and p.deleted_at is null and p.status <> 'CANCELLED';
$$;

create or replace function public.sync_event_operation_cost(p_project_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  estimate public.estimated_cost_sheets%rowtype;
  truth public.financial_event_records%rowtype;
  staff record;
  real_operator numeric; real_assembly numeric; real_disassembly numeric;
  real_fuel numeric; real_transport numeric; real_scrapbook numeric; real_magnets numeric; real_other numeric:=0;
  operator_value numeric:=0; assembly_value numeric:=0; disassembly_value numeric:=0;
  fuel_value numeric:=0; transport_value numeric:=0; scrapbook_value numeric:=0; magnets_value numeric:=0; other_value numeric:=0;
  expense_net numeric:=0; staff_net numeric:=0; staff_tax numeric:=0; personnel numeric:=0; resources numeric:=0; total_value numeric:=0; profit_value numeric:=0; margin_value numeric:=0; estimated_tax numeric:=0; breakdown jsonb;
begin
  select * into estimate from public.estimated_cost_sheets where project_id=p_project_id;
  select * into truth from public.financial_event_records where project_id=p_project_id;
  if not found or estimate.id is null then return; end if;
  select * into staff from public.event_staff_payment_role_totals(p_project_id);
  select edited_value into real_operator from public.financial_cost_overrides where project_id=p_project_id and category='OPERATOR' order by created_at desc limit 1;
  select edited_value into real_assembly from public.financial_cost_overrides where project_id=p_project_id and category='ASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_disassembly from public.financial_cost_overrides where project_id=p_project_id and category='DISASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_fuel from public.financial_cost_overrides where project_id=p_project_id and category='FUEL' order by created_at desc limit 1;
  select edited_value into real_transport from public.financial_cost_overrides where project_id=p_project_id and category='TRANSPORT' order by created_at desc limit 1;
  select edited_value into real_scrapbook from public.financial_cost_overrides where project_id=p_project_id and category='SCRAPBOOK' order by created_at desc limit 1;
  select edited_value into real_magnets from public.financial_cost_overrides where project_id=p_project_id and category='MAGNETS' order by created_at desc limit 1;
  select coalesce(sum(edited_value),0) into real_other from (select distinct on(category) category,edited_value from public.financial_cost_overrides where project_id=p_project_id and category in('PARKING','TOLLS','MEALS','HOTEL','OTHER_OPERATIONAL','MISCELLANEOUS') order by category,created_at desc) latest;
  select coalesce(sum(subtotal),0) into expense_net from public.expenses where project_id=p_project_id and deleted_at is null and status <> 'CANCELLED';

  operator_value:=coalesce(real_operator,case when staff.payment_rows>0 then staff.operator end,estimate.operator);
  assembly_value:=coalesce(real_assembly,case when staff.payment_rows>0 then staff.assembly end,estimate.assembly);
  disassembly_value:=coalesce(real_disassembly,case when staff.payment_rows>0 then staff.disassembly end,estimate.disassembly);
  fuel_value:=coalesce(real_fuel,estimate.fuel); transport_value:=coalesce(real_transport,estimate.transport);
  scrapbook_value:=coalesce(real_scrapbook,estimate.scrapbook); magnets_value:=coalesce(real_magnets,estimate.magnets); other_value:=estimate.other_configured+real_other;
  staff_net:=operator_value+assembly_value+disassembly_value+staff.adjustments;
  staff_tax:=public.staff_company_cost_from_net(staff_net)-staff_net; personnel:=staff_net+staff_tax;
  resources:=estimate.paper+fuel_value+transport_value+scrapbook_value+magnets_value+estimate.branding+estimate.pens+estimate.double_sided_tape+other_value+expense_net;
  total_value:=case when truth.status='CANCELLED' then 0 else personnel+resources end;
  profit_value:=case when truth.status='CANCELLED' then 0 else truth.revenue-total_value end;
  margin_value:=case when truth.revenue=0 then 0 else profit_value/truth.revenue*100 end;
  estimated_tax:=public.staff_company_cost_from_net(estimate.operator+estimate.assembly+estimate.disassembly)-(estimate.operator+estimate.assembly+estimate.disassembly);
  breakdown:=jsonb_build_object('personnelCost',personnel,'operator',operator_value,'assembly',assembly_value,'disassembly',disassembly_value,'staffAdjustments',staff.adjustments,'staffTax',staff_tax,'staffTaxRate',public.staff_withholding_rate()*100,'operationalResourcesCost',resources,'paper',estimate.paper,'fuel',fuel_value,'transport',transport_value,'scrapbook',scrapbook_value,'magnets',magnets_value,'branding',estimate.branding,'brandingFaces',estimate.branding_faces,'brandingUnitCost',estimate.branding_unit_cost,'pens',estimate.pens,'doubleSidedTape',estimate.double_sided_tape,'other',other_value,'registeredExpenses',expense_net,'totalOperationalCost',total_value,'staffPaymentRows',staff.payment_rows,'source','CANONICAL_EVENT_STAFF_PAYMENTS_WITH_OVERRIDES');
  update public.financial_event_records set personnel_cost=case when status='CANCELLED' then 0 else personnel end, operational_resources_cost=case when status='CANCELLED' then 0 else resources end, total_operational_cost=total_value, estimated_cost=case when status='CANCELLED' then 0 else estimate.total+estimated_tax end, real_cost=total_value, gross_profit=profit_value, net_profit=profit_value, gross_margin=margin_value, net_margin=margin_value, cost_breakdown=breakdown, calculated_at=now(), updated_at=now(), version=version+1 where project_id=p_project_id;
end;
$$;

grant execute on function public.event_staff_payment_role_totals(uuid) to authenticated, service_role;
commit;
