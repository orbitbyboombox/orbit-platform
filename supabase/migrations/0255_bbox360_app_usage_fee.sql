-- BOOMBOX: licencia/aplicación BBOX360 $45.000 por evento, desde 2026-10-13.
-- Copia previa para recuperación de importes y desglose de los eventos alcanzados.
CREATE TABLE IF NOT EXISTS public.orbit_bbox360_app_fee_backup_20261013 AS
SELECT p.id AS project_id, now() AS captured_at, to_jsonb(f) AS financial_event_record
FROM public.projects p
JOIN public.project_services ps ON ps.project_id=p.id AND upper(ps.service_code)='BBOX360'
JOIN public.financial_event_records f ON f.project_id=p.id
WHERE f.event_date >= date '2026-10-13' AND f.status <> 'CANCELLED';
INSERT INTO public.cost_master_entries(category,code,label,amount,quantity,unit,enabled,metadata,approval_reason)
VALUES('OTHER','BBOX360_APP_USAGE','Uso de aplicación BBOX360',45000,1,'EVENT',true,
'{"service":"BBOX360","effectiveDate":"2026-10-13","per":"EVENT"}'::jsonb,
'Costo confirmado por Founder: $45.000 por uso')
ON CONFLICT(code) DO UPDATE SET amount=45000,quantity=1,unit='EVENT',enabled=true,deleted_at=null,
metadata=excluded.metadata,approval_reason=excluded.approval_reason,updated_at=now();

CREATE OR REPLACE FUNCTION public.event_cost_breakdown_total(p_breakdown jsonb)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(coalesce((p_breakdown->>key)::numeric,0)),0)
  from unnest(array['operator','assembly','disassembly','staffAdjustments','staffTax','paper','fuel','transport','appUsage','scrapbook','magnets','branding','pens','doubleSidedTape','registeredExpenses','other']) key
$function$;

CREATE OR REPLACE FUNCTION public.calculate_event_operation_cost(p_project_id uuid)
 RETURNS TABLE(personnel_cost numeric, operational_resources_cost numeric, total_operational_cost numeric, estimated_cost numeric, cost_breakdown jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  estimate public.estimated_cost_sheets%rowtype;truth public.financial_event_records%rowtype;
  staff_operator numeric:=0;staff_assembly numeric:=0;staff_disassembly numeric:=0;staff_adjustments numeric:=0;confirmed_settlements integer:=0;
  real_operator numeric;real_assembly numeric;real_disassembly numeric;real_fuel numeric;real_transport numeric;real_scrapbook numeric;real_magnets numeric;real_other numeric:=0;
  operator_value numeric:=0;assembly_value numeric:=0;disassembly_value numeric:=0;fuel_value numeric:=0;transport_value numeric:=0;scrapbook_value numeric:=0;magnets_value numeric:=0;other_value numeric:=0;
  expense_net numeric:=0;expense_fuel numeric:=0;route_fuel numeric:=0;historical_fuel numeric:=0;staff_net numeric:=0;staff_tax numeric:=0;estimated_tax numeric:=0;
  app_usage_cost numeric:=0;
  actual_paper_usage numeric;cost_per_photo numeric:=0;paper_value numeric:=0;
begin
  select * into estimate from public.estimated_cost_sheets where project_id=p_project_id;
  select * into truth from public.financial_event_records where project_id=p_project_id;
  if estimate.id is null or truth.id is null then return; end if;
  select count(*),coalesce(sum(operator_payment),0),coalesce(sum(assembly_payment),0),coalesce(sum(disassembly_payment),0)
    into confirmed_settlements,staff_operator,staff_assembly,staff_disassembly from public.event_staff_payments where project_id=p_project_id and deleted_at is null and status='CONFIRMED';
  select coalesce(sum(a.amount),0) into staff_adjustments from public.event_staff_settlement_adjustments a join public.event_staff_payments s on s.id=a.settlement_id where s.project_id=p_project_id and s.deleted_at is null and s.status='CONFIRMED';
  select edited_value into real_operator from public.financial_cost_overrides where project_id=p_project_id and category='OPERATOR' order by created_at desc limit 1;
  select edited_value into real_assembly from public.financial_cost_overrides where project_id=p_project_id and category='ASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_disassembly from public.financial_cost_overrides where project_id=p_project_id and category='DISASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_fuel from public.financial_cost_overrides where project_id=p_project_id and category='FUEL' order by created_at desc limit 1;
  select edited_value into real_transport from public.financial_cost_overrides where project_id=p_project_id and category='TRANSPORT' order by created_at desc limit 1;
  select edited_value into real_scrapbook from public.financial_cost_overrides where project_id=p_project_id and category='SCRAPBOOK' order by created_at desc limit 1;
  select edited_value into real_magnets from public.financial_cost_overrides where project_id=p_project_id and category='MAGNETS' order by created_at desc limit 1;
  select coalesce(sum(edited_value),0) into real_other from(select distinct on(category) category,edited_value from public.financial_cost_overrides where project_id=p_project_id and category in('PARKING','TOLLS','MEALS','HOTEL','OTHER_OPERATIONAL','MISCELLANEOUS') order by category,created_at desc) latest;
  select coalesce(sum(total) filter(where category='FUEL'),0),coalesce(sum(total) filter(where category<>'FUEL'),0)
    into expense_fuel,expense_net from public.expenses where project_id=p_project_id and deleted_at is null and status not in('CANCELLED','REJECTED');
  select coalesce(sum(vre.allocated_fuel_cost),0) into route_fuel from public.vehicle_route_events vre join public.vehicle_routes vr on vr.id=vre.route_id and vr.deleted_at is null and vr.status='ACTIVE' where vre.project_id=p_project_id;
  historical_fuel:=case when estimate.fuel>0 and coalesce(estimate.source_snapshot->>'source','')<>'COST_MASTER_AND_MASTER_DATA' then estimate.fuel else 0 end;
  operator_value:=round(coalesce(real_operator,case when confirmed_settlements>0 then staff_operator end,estimate.operator),2);
  assembly_value:=round(coalesce(real_assembly,case when confirmed_settlements>0 then staff_assembly end,estimate.assembly),2);
  disassembly_value:=round(coalesce(real_disassembly,case when confirmed_settlements>0 then staff_disassembly end,estimate.disassembly),2);
  staff_adjustments:=round(staff_adjustments,2);
  fuel_value:=round(coalesce(real_fuel,nullif(expense_fuel+route_fuel,0),historical_fuel,0),2);
  transport_value:=round(coalesce(real_transport,public.default_real_transport_cost()),2);
  scrapbook_value:=round(coalesce(real_scrapbook,estimate.scrapbook),2);magnets_value:=round(coalesce(real_magnets,estimate.magnets),2);
  other_value:=round(estimate.other_configured+real_other,2);expense_net:=round(expense_net,2);
  select sum(s.event_usage) into actual_paper_usage
  from public.event_paper_snapshots s
  where s.project_id=p_project_id
    and s.status in('CONFIRMED','OVERRIDDEN')
    and s.event_usage is not null;
  select coalesce(amount,0) into cost_per_photo
  from public.cost_master_entries
  where code='COST_PER_PHOTO' and enabled and deleted_at is null
  order by updated_at desc limit 1;
  paper_value:=case
    when truth.event_date>=date '2026-10-02' and actual_paper_usage is not null
      then round(actual_paper_usage*cost_per_photo,2)
    else round(estimate.paper,2)
  end;
  if truth.event_date>=date '2026-10-13' and exists(select 1 from public.project_services ps where ps.project_id=p_project_id and upper(ps.service_code)='BBOX360') then
    select coalesce(amount,0) into app_usage_cost from public.cost_master_entries
    where code='BBOX360_APP_USAGE' and enabled and deleted_at is null limit 1;
    app_usage_cost:=coalesce(app_usage_cost,0);
  end if;
  staff_net:=round(operator_value+assembly_value+disassembly_value+staff_adjustments,2);staff_tax:=public.staff_company_cost_from_net(staff_net)-staff_net;
  personnel_cost:=case when truth.status='CANCELLED' then 0 else round(staff_net+staff_tax,2) end;
  operational_resources_cost:=case when truth.status='CANCELLED' then 0 else round(paper_value+fuel_value+transport_value+app_usage_cost+scrapbook_value+magnets_value+round(estimate.branding,2)+round(estimate.pens,2)+round(estimate.double_sided_tape,2)+other_value+expense_net,2) end;
  total_operational_cost:=round(personnel_cost+operational_resources_cost,2);
  estimated_tax:=public.staff_company_cost_from_net(estimate.operator+estimate.assembly+estimate.disassembly)-(estimate.operator+estimate.assembly+estimate.disassembly);
  estimated_cost:=case when truth.status='CANCELLED' then 0 else estimate.total+estimated_tax+app_usage_cost end;
  cost_breakdown:=jsonb_build_object('personnelCost',personnel_cost,'operator',case when truth.status='CANCELLED' then 0 else operator_value end,'assembly',case when truth.status='CANCELLED' then 0 else assembly_value end,'disassembly',case when truth.status='CANCELLED' then 0 else disassembly_value end,'staffAdjustments',case when truth.status='CANCELLED' then 0 else staff_adjustments end,'staffTax',case when truth.status='CANCELLED' then 0 else staff_tax end,'staffTaxRate',public.staff_withholding_rate()*100,'operationalResourcesCost',operational_resources_cost,'paper',case when truth.status='CANCELLED' then 0 else paper_value end,'fuel',case when truth.status='CANCELLED' then 0 else fuel_value end,'transport',case when truth.status='CANCELLED' then 0 else transport_value end,'appUsage',case when truth.status='CANCELLED' then 0 else app_usage_cost end,'scrapbook',case when truth.status='CANCELLED' then 0 else scrapbook_value end,'magnets',case when truth.status='CANCELLED' then 0 else magnets_value end,'branding',case when truth.status='CANCELLED' then 0 else round(estimate.branding,2) end,'brandingFaces',estimate.branding_faces,'brandingUnitCost',estimate.branding_unit_cost,'pens',case when truth.status='CANCELLED' then 0 else round(estimate.pens,2) end,'doubleSidedTape',case when truth.status='CANCELLED' then 0 else round(estimate.double_sided_tape,2) end,'registeredExpenses',case when truth.status='CANCELLED' then 0 else expense_net end,'other',case when truth.status='CANCELLED' then 0 else other_value end,'totalOperationalCost',total_operational_cost,'source','CANONICAL_TRANSPORT_WITH_EXPLICIT_EXTRA_FUEL_V2');
  return next;
end $function$;

CREATE OR REPLACE FUNCTION public.sync_event_operation_cost(p_project_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  app_usage_cost numeric:=0;
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
  if truth.event_date>=date '2026-10-13' and exists(select 1 from public.project_services ps where ps.project_id=p_project_id and upper(ps.service_code)='BBOX360') then
    select coalesce(amount,0) into app_usage_cost from public.cost_master_entries
    where code='BBOX360_APP_USAGE' and enabled and deleted_at is null limit 1;
    app_usage_cost:=coalesce(app_usage_cost,0);
  end if;
  resources:=paper_value+fuel_value+transport_value+app_usage_cost+scrapbook_value+magnets_value+branding_value+estimate.pens+estimate.double_sided_tape+other_value+expense_net;
  total_value:=case when truth.status='CANCELLED' then 0 else personnel+resources end;
  profit_value:=case when truth.status='CANCELLED' then 0 else truth.revenue-total_value end;
  margin_value:=case when truth.revenue=0 then 0 else profit_value/truth.revenue*100 end;
  estimated_tax:=public.staff_company_cost_from_net(estimate.operator+estimate.assembly+estimate.disassembly)-(estimate.operator+estimate.assembly+estimate.disassembly);
  breakdown:=jsonb_build_object('personnelCost',personnel,'operator',operator_value,'assembly',assembly_value,'disassembly',disassembly_value,'staffAdjustments',staff.adjustments,'staffTax',staff_tax,'staffTaxRate',public.staff_withholding_rate()*100,'operationalResourcesCost',resources,'paper',paper_value,'paperSource',case when snapshot_count>0 then paper->>'source' else 'ESTIMATED_COST_SHEET_FALLBACK' end,'paperUsage',coalesce((paper->>'usage')::numeric,0),'confirmedPaperSnapshots',snapshot_count,'fuel',fuel_value,'transport',transport_value,'appUsage',app_usage_cost,'scrapbook',scrapbook_value,'magnets',magnets_value,'branding',branding_value,'brandingSource',case when branding_from_quote then 'CURRENT_QUOTATION_ITEM' else 'EVENT_BRANDING_FACES_COMPATIBILITY_FALLBACK' end,'brandingFaces',branding_faces,'brandingUnitCost',branding_unit,'pens',estimate.pens,'doubleSidedTape',estimate.double_sided_tape,'other',other_value,'registeredExpenses',expense_net,'totalOperationalCost',total_value,'staffPaymentRows',staff.payment_rows,'source','CANONICAL_CONFIRMED_PAPER_QUOTE_BRANDING_STAFF_V1');
  update public.financial_event_records set personnel_cost=case when status='CANCELLED' then 0 else personnel end,operational_resources_cost=case when status='CANCELLED' then 0 else resources end,total_operational_cost=total_value,estimated_cost=case when status='CANCELLED' then 0 else estimate.total+estimated_tax+app_usage_cost end,real_cost=total_value,gross_profit=profit_value,net_profit=profit_value,gross_margin=margin_value,net_margin=margin_value,cost_breakdown=breakdown,calculated_at=now(),updated_at=now(),version=version+1 where project_id=p_project_id;
end;
$function$;

DO $$
DECLARE event_row record;
BEGIN
 FOR event_row IN SELECT DISTINCT f.project_id FROM public.financial_event_records f
 JOIN public.project_services ps ON ps.project_id=f.project_id
 WHERE upper(ps.service_code)='BBOX360' AND f.event_date>=date '2026-10-13' AND f.status<>'CANCELLED'
 LOOP
   PERFORM public.sync_event_profitability(event_row.project_id);
 END LOOP;
END $$;
