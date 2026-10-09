begin;

-- Follow-up to the already applied global_paper_cost_sync migration.
-- Do not use estimated paper/branding when confirmed operational evidence exists.
create or replace function public.sync_event_operation_cost(p_project_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  estimate public.estimated_cost_sheets%rowtype;
  truth public.financial_event_records%rowtype;
  staff record;
  paper jsonb;
  snapshot_count integer := 0;
  paper_value numeric;
  branding_faces numeric := 0;
  branding_from_quote boolean := false;
  branding_unit numeric;
  branding_value numeric := 0;
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
  edited_operator numeric;
  edited_assembly numeric;
  edited_disassembly numeric;
  edited_fuel numeric;
  edited_transport numeric;
  edited_scrapbook numeric;
  edited_magnets numeric;
  edited_other numeric := 0;
  breakdown jsonb;
begin
  select * into estimate from public.estimated_cost_sheets where project_id=p_project_id;
  select * into truth from public.financial_event_records where project_id=p_project_id;
  if not found or estimate.id is null then return; end if;

  select count(*)::integer into snapshot_count
  from public.event_paper_snapshots
  where project_id=p_project_id and paper_required and status in ('CONFIRMED','OVERRIDDEN');
  paper := public.calculate_event_paper_cost(p_project_id);
  if snapshot_count > 0 then
    if coalesce((paper->>'reviewRequired')::boolean,true) then return; end if;
    paper_value := coalesce((paper->>'totalCost')::numeric,0);
  else
    paper_value := coalesce(estimate.paper,0);
  end if;

  select coalesce(sum(qi.quantity),0), count(*)>0
  into branding_faces, branding_from_quote
  from public.quotations q
  join public.quotation_items qi on qi.quotation_id=q.id
  where q.project_id=p_project_id and q.status in ('ACCEPTED','CONVERTED')
    and q.deleted_at is null and upper(qi.code)='BRANDING'
    and q.id=(select q2.id from public.quotations q2
      where q2.project_id=p_project_id and q2.status in ('ACCEPTED','CONVERTED')
        and q2.deleted_at is null
      order by q2.approved_at desc nulls last,q2.created_at desc limit 1);
  if not branding_from_quote then branding_faces:=coalesce(public.event_branding_faces(p_project_id),0); end if;
  select amount into branding_unit from public.cost_master_entries
  where code='BRANDING_FACE' and enabled and deleted_at is null
  order by version desc,updated_at desc limit 1;
  if branding_faces>0 and branding_unit is null then return; end if;
  branding_value:=branding_faces*coalesce(branding_unit,0);

  select * into staff from public.event_staff_payment_role_totals(p_project_id);
  select edited_value into edited_operator from public.financial_cost_overrides where project_id=p_project_id and category='OPERATOR' order by created_at desc limit 1;
  select edited_value into edited_assembly from public.financial_cost_overrides where project_id=p_project_id and category='ASSEMBLY' order by created_at desc limit 1;
  select edited_value into edited_disassembly from public.financial_cost_overrides where project_id=p_project_id and category='DISASSEMBLY' order by created_at desc limit 1;
  select edited_value into edited_fuel from public.financial_cost_overrides where project_id=p_project_id and category='FUEL' order by created_at desc limit 1;
  select edited_value into edited_transport from public.financial_cost_overrides where project_id=p_project_id and category='TRANSPORT' order by created_at desc limit 1;
  select edited_value into edited_scrapbook from public.financial_cost_overrides where project_id=p_project_id and category='SCRAPBOOK' order by created_at desc limit 1;
  select edited_value into edited_magnets from public.financial_cost_overrides where project_id=p_project_id and category='MAGNETS' order by created_at desc limit 1;
  select coalesce(sum(edited_value),0) into edited_other from (select distinct on(category) category,edited_value
    from public.financial_cost_overrides where project_id=p_project_id
      and category in('PARKING','TOLLS','MEALS','HOTEL','OTHER_OPERATIONAL','MISCELLANEOUS')
    order by category,created_at desc) latest;
  select coalesce(sum(subtotal),0) into expense_net from public.expenses
  where project_id=p_project_id and deleted_at is null and status<>'CANCELLED';

  operator_value:=coalesce(edited_operator,case when staff.payment_rows>0 then staff.operator end,estimate.operator);
  assembly_value:=coalesce(edited_assembly,case when staff.payment_rows>0 then staff.assembly end,estimate.assembly);
  disassembly_value:=coalesce(edited_disassembly,case when staff.payment_rows>0 then staff.disassembly end,estimate.disassembly);
  fuel_value:=coalesce(edited_fuel,estimate.fuel);
  transport_value:=coalesce(edited_transport,estimate.transport);
  scrapbook_value:=coalesce(edited_scrapbook,estimate.scrapbook);
  magnets_value:=coalesce(edited_magnets,estimate.magnets);
  other_value:=estimate.other_configured+edited_other;
  staff_net:=operator_value+assembly_value+disassembly_value+staff.adjustments;
  staff_tax:=public.staff_company_cost_from_net(staff_net)-staff_net;
  personnel:=staff_net+staff_tax;
  resources:=paper_value+fuel_value+transport_value+scrapbook_value+magnets_value+branding_value+estimate.pens+estimate.double_sided_tape+other_value+expense_net;
  total_value:=case when truth.status='CANCELLED' then 0 else personnel+resources end;
  profit_value:=case when truth.status='CANCELLED' then 0 else truth.revenue-total_value end;
  margin_value:=case when truth.revenue=0 then 0 else profit_value/truth.revenue*100 end;
  estimated_tax:=public.staff_company_cost_from_net(estimate.operator+estimate.assembly+estimate.disassembly)-(estimate.operator+estimate.assembly+estimate.disassembly);
  breakdown:=jsonb_build_object('personnelCost',personnel,'operator',operator_value,'assembly',assembly_value,'disassembly',disassembly_value,'staffAdjustments',staff.adjustments,'staffTax',staff_tax,'staffTaxRate',public.staff_withholding_rate()*100,'operationalResourcesCost',resources,'paper',paper_value,'paperSource',case when snapshot_count>0 then paper->>'source' else 'ESTIMATED_COST_SHEET_FALLBACK' end,'paperUsage',coalesce((paper->>'usage')::numeric,0),'confirmedPaperSnapshots',snapshot_count,'fuel',fuel_value,'transport',transport_value,'scrapbook',scrapbook_value,'magnets',magnets_value,'branding',branding_value,'brandingSource',case when branding_from_quote then 'CURRENT_QUOTATION_ITEM' else 'EVENT_BRANDING_FACES_COMPATIBILITY_FALLBACK' end,'brandingFaces',branding_faces,'brandingUnitCost',branding_unit,'pens',estimate.pens,'doubleSidedTape',estimate.double_sided_tape,'other',other_value,'registeredExpenses',expense_net,'totalOperationalCost',total_value,'staffPaymentRows',staff.payment_rows,'source','CANONICAL_CONFIRMED_PAPER_QUOTE_BRANDING_STAFF_V1');
  update public.financial_event_records set personnel_cost=case when status='CANCELLED' then 0 else personnel end,operational_resources_cost=case when status='CANCELLED' then 0 else resources end,total_operational_cost=total_value,estimated_cost=case when status='CANCELLED' then 0 else estimate.total+estimated_tax end,real_cost=total_value,gross_profit=profit_value,net_profit=profit_value,gross_margin=margin_value,net_margin=margin_value,cost_breakdown=breakdown,calculated_at=now(),updated_at=now(),version=version+1 where project_id=p_project_id;
end;
$$;

revoke all on function public.sync_event_operation_cost(uuid) from public,anon;
grant execute on function public.sync_event_operation_cost(uuid) to authenticated,service_role;

commit;
