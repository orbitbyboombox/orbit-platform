begin;

create or replace function public.calculate_event_operation_cost(p_project_id uuid)
returns table(
  personnel_cost numeric,
  operational_resources_cost numeric,
  total_operational_cost numeric,
  estimated_cost numeric,
  cost_breakdown jsonb
) language plpgsql stable security definer set search_path=public as $$
declare
  estimate public.estimated_cost_sheets%rowtype;
  truth public.financial_event_records%rowtype;
  staff_operator numeric:=0; staff_assembly numeric:=0; staff_disassembly numeric:=0;
  staff_adjustments numeric:=0; confirmed_settlements integer:=0;
  real_operator numeric; real_assembly numeric; real_disassembly numeric;
  real_fuel numeric; real_transport numeric; real_scrapbook numeric; real_magnets numeric;
  real_other numeric:=0;
  operator_value numeric:=0; assembly_value numeric:=0; disassembly_value numeric:=0;
  fuel_value numeric:=0; transport_value numeric:=0; scrapbook_value numeric:=0;
  magnets_value numeric:=0; other_value numeric:=0; expense_net numeric:=0;
  staff_net numeric:=0; staff_tax numeric:=0; estimated_tax numeric:=0;
begin
  select * into estimate from public.estimated_cost_sheets where project_id=p_project_id;
  select * into truth from public.financial_event_records where project_id=p_project_id;
  if estimate.id is null or truth.id is null then return; end if;

  select count(*),coalesce(sum(operator_payment),0),coalesce(sum(assembly_payment),0),coalesce(sum(disassembly_payment),0)
    into confirmed_settlements,staff_operator,staff_assembly,staff_disassembly
  from public.event_staff_payments
  where project_id=p_project_id and deleted_at is null and status='CONFIRMED';

  select coalesce(sum(a.amount),0) into staff_adjustments
  from public.event_staff_settlement_adjustments a
  join public.event_staff_payments s on s.id=a.settlement_id
  where s.project_id=p_project_id and s.deleted_at is null and s.status='CONFIRMED';

  select edited_value into real_operator from public.financial_cost_overrides where project_id=p_project_id and category='OPERATOR' order by created_at desc limit 1;
  select edited_value into real_assembly from public.financial_cost_overrides where project_id=p_project_id and category='ASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_disassembly from public.financial_cost_overrides where project_id=p_project_id and category='DISASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_fuel from public.financial_cost_overrides where project_id=p_project_id and category='FUEL' order by created_at desc limit 1;
  select edited_value into real_transport from public.financial_cost_overrides where project_id=p_project_id and category='TRANSPORT' order by created_at desc limit 1;
  select edited_value into real_scrapbook from public.financial_cost_overrides where project_id=p_project_id and category='SCRAPBOOK' order by created_at desc limit 1;
  select edited_value into real_magnets from public.financial_cost_overrides where project_id=p_project_id and category='MAGNETS' order by created_at desc limit 1;
  select coalesce(sum(edited_value),0) into real_other
  from (select distinct on(category) category,edited_value from public.financial_cost_overrides
        where project_id=p_project_id and category in('PARKING','TOLLS','MEALS','HOTEL','OTHER_OPERATIONAL','MISCELLANEOUS')
        order by category,created_at desc) latest;
  select coalesce(sum(total),0) into expense_net from public.expenses
  where project_id=p_project_id and deleted_at is null and status<>'CANCELLED';

  operator_value:=round(coalesce(real_operator,case when confirmed_settlements>0 then staff_operator end,estimate.operator),2);
  assembly_value:=round(coalesce(real_assembly,case when confirmed_settlements>0 then staff_assembly end,estimate.assembly),2);
  disassembly_value:=round(coalesce(real_disassembly,case when confirmed_settlements>0 then staff_disassembly end,estimate.disassembly),2);
  staff_adjustments:=round(staff_adjustments,2);
  fuel_value:=round(coalesce(real_fuel,estimate.fuel),2);
  transport_value:=round(coalesce(real_transport,public.default_real_transport_cost()),2);
  scrapbook_value:=round(coalesce(real_scrapbook,estimate.scrapbook),2);
  magnets_value:=round(coalesce(real_magnets,estimate.magnets),2);
  other_value:=round(estimate.other_configured+real_other,2);
  expense_net:=round(expense_net,2);
  staff_net:=round(operator_value+assembly_value+disassembly_value+staff_adjustments,2);
  staff_tax:=public.staff_company_cost_from_net(staff_net)-staff_net;

  personnel_cost:=case when truth.status='CANCELLED' then 0 else round(staff_net+staff_tax,2) end;
  operational_resources_cost:=case when truth.status='CANCELLED' then 0 else round(
    round(estimate.paper,2)+fuel_value+transport_value+scrapbook_value+magnets_value+
    round(estimate.branding,2)+round(estimate.pens,2)+round(estimate.double_sided_tape,2)+other_value+expense_net,2) end;
  total_operational_cost:=round(personnel_cost+operational_resources_cost,2);
  estimated_tax:=public.staff_company_cost_from_net(estimate.operator+estimate.assembly+estimate.disassembly)-(estimate.operator+estimate.assembly+estimate.disassembly);
  estimated_cost:=case when truth.status='CANCELLED' then 0 else estimate.total+estimated_tax end;
  cost_breakdown:=jsonb_build_object(
    'personnelCost',personnel_cost,'operator',case when truth.status='CANCELLED' then 0 else operator_value end,
    'assembly',case when truth.status='CANCELLED' then 0 else assembly_value end,
    'disassembly',case when truth.status='CANCELLED' then 0 else disassembly_value end,
    'staffAdjustments',case when truth.status='CANCELLED' then 0 else staff_adjustments end,
    'staffTax',case when truth.status='CANCELLED' then 0 else staff_tax end,
    'staffTaxRate',public.staff_withholding_rate()*100,
    'operationalResourcesCost',operational_resources_cost,
    'paper',case when truth.status='CANCELLED' then 0 else round(estimate.paper,2) end,
    'fuel',case when truth.status='CANCELLED' then 0 else fuel_value end,
    'transport',case when truth.status='CANCELLED' then 0 else transport_value end,
    'scrapbook',case when truth.status='CANCELLED' then 0 else scrapbook_value end,
    'magnets',case when truth.status='CANCELLED' then 0 else magnets_value end,
    'branding',case when truth.status='CANCELLED' then 0 else round(estimate.branding,2) end,
    'brandingFaces',estimate.branding_faces,'brandingUnitCost',estimate.branding_unit_cost,
    'pens',case when truth.status='CANCELLED' then 0 else round(estimate.pens,2) end,
    'doubleSidedTape',case when truth.status='CANCELLED' then 0 else round(estimate.double_sided_tape,2) end,
    'registeredExpenses',case when truth.status='CANCELLED' then 0 else expense_net end,
    'other',case when truth.status='CANCELLED' then 0 else other_value end,
    'totalOperationalCost',total_operational_cost,
    'source','CANONICAL_EVENT_OPERATION_COST_V1');
  return next;
end $$;

revoke all on function public.calculate_event_operation_cost(uuid) from public,anon;
grant execute on function public.calculate_event_operation_cost(uuid) to authenticated,service_role;

commit;
