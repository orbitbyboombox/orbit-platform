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
  select coalesce(sum(amount),0) into expense_net from public.expenses
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

create or replace function public.sync_event_profitability(p_project_id uuid)returns uuid language plpgsql security definer set search_path=public as $$
declare p public.projects%rowtype;q public.quotations%rowtype;e public.estimated_cost_sheets%rowtype;s public.profitability_settings%rowtype;
  service numeric:=0;extras numeric:=0;charges numeric:=0;discounts numeric:=0;final_price numeric:=0;hours numeric:=0;photos numeric:=0;cost_photo numeric:=0;
  real_operator numeric;real_assembly numeric;real_disassembly numeric;real_fuel numeric;real_transport numeric;real_scrapbook numeric;real_magnets numeric;real_other numeric;
  real_total numeric:=0;gross_profit numeric:=0;margin numeric:=0;variance_value numeric:=0;signature text;statement_id uuid;classification_value text;latest_reason text;
begin
  select * into p from public.projects where id=p_project_id and deleted_at is null;if not found or upper(p.status) in('CANCELLED','CANCELED','ARCHIVED')then return null;end if;
  select * into q from public.quotations where project_id=p.id and status='ACCEPTED' and deleted_at is null order by created_at desc limit 1;if not found then return null;end if;
  select * into e from public.estimated_cost_sheets where project_id=p.id;if not found then return null;end if;select * into s from public.profitability_settings where settings_key='PRIMARY';
  select coalesce(sum(final_total) filter(where item_type='SERVICE'),0),coalesce(sum(final_total) filter(where item_type='EXTRA'),0) into service,extras from public.quotation_items where quotation_id=q.id;
  final_price:=coalesce(q.final_customer_price,q.grand_total,0);charges:=greatest(final_price-coalesce(q.official_price,final_price),0);discounts:=greatest(coalesce(q.official_price,final_price)-final_price,0)+coalesce(q.discount_total,0);
  select coalesce(sum(duration_hours),0),coalesce(sum(duration_hours*coalesce((m.configuration->>'estimatedPhotosPerHour')::numeric,0)),0) into hours,photos from public.project_services ps left join public.master_data_entries m on m.domain='SERVICES' and m.code=ps.service_code and m.enabled where ps.project_id=p.id;
  select coalesce(amount,0) into cost_photo from public.cost_master_entries where code='COST_PER_PHOTO' and enabled and deleted_at is null limit 1;
  select edited_value,reason into real_operator,latest_reason from public.financial_cost_overrides where project_id=p.id and category='OPERATOR' order by created_at desc limit 1;
  select edited_value into real_assembly from public.financial_cost_overrides where project_id=p.id and category='ASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_disassembly from public.financial_cost_overrides where project_id=p.id and category='DISASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_fuel from public.financial_cost_overrides where project_id=p.id and category='FUEL' order by created_at desc limit 1;
  select edited_value into real_transport from public.financial_cost_overrides where project_id=p.id and category='TRANSPORT' order by created_at desc limit 1;
  select edited_value into real_scrapbook from public.financial_cost_overrides where project_id=p.id and category='SCRAPBOOK' order by created_at desc limit 1;
  select edited_value into real_magnets from public.financial_cost_overrides where project_id=p.id and category='MAGNETS' order by created_at desc limit 1;
  select coalesce(sum(edited_value),0),string_agg(reason,' · ' order by created_at desc) into real_other,latest_reason from(select distinct on(category)category,edited_value,reason,created_at from public.financial_cost_overrides where project_id=p.id and category in('PARKING','TOLLS','MEALS','HOTEL','OTHER_OPERATIONAL')order by category,created_at desc)x;
  real_total:=e.paper+coalesce(real_operator,e.operator)+coalesce(real_assembly,e.assembly)+coalesce(real_disassembly,e.disassembly)+coalesce(real_fuel,e.fuel)+coalesce(real_transport,public.default_real_transport_cost())+coalesce(real_scrapbook,e.scrapbook)+coalesce(real_magnets,e.magnets)+coalesce(real_other,e.pens+e.double_sided_tape+e.other_configured);
  gross_profit:=final_price-real_total;margin:=case when final_price=0 then 0 else gross_profit/final_price*100 end;variance_value:=real_total-e.total;classification_value:=case when margin>=s.high_margin_threshold then'HIGHLY_PROFITABLE'when margin>=s.normal_margin_threshold then'NORMAL'else'LOW_MARGIN'end;
  signature:=md5(concat_ws('|',q.updated_at,e.updated_at,(select max(created_at)from public.financial_cost_overrides where project_id=p.id),s.updated_at,final_price,real_total,photos));
  insert into public.event_profitability_statements(project_id,orbit_event_id,revenue,estimated_costs,real_costs,profitability,variance,performance,classification,source_signature,created_by)
  values(p.id,p.orbit_event_id,jsonb_build_object('service',service,'extras',extras,'transport',q.transport_total,'commercialCharges',charges,'commercialDiscounts',discounts,'finalSalePrice',final_price,'paymentStatus',coalesce(p.finance->>'status','PENDING'),'invoiceStatus',coalesce((select status from public.invoices where project_id=p.id and deleted_at is null order by created_at desc limit 1),'NOT_ISSUED')),to_jsonb(e)-'id'-'project_id'-'orbit_event_id'-'source_snapshot',jsonb_build_object('paper',e.paper,'operator',coalesce(real_operator,e.operator),'assembly',coalesce(real_assembly,e.assembly),'disassembly',coalesce(real_disassembly,e.disassembly),'fuel',coalesce(real_fuel,e.fuel),'transport',coalesce(real_transport,public.default_real_transport_cost()),'scrapbook',coalesce(real_scrapbook,e.scrapbook),'magnets',coalesce(real_magnets,e.magnets),'miscellaneous',coalesce(real_other,e.pens+e.double_sided_tape+e.other_configured),'total',real_total),jsonb_build_object('grossRevenue',final_price,'estimatedCost',e.total,'realCost',real_total,'grossProfit',gross_profit,'netProfit',gross_profit,'margin',margin),jsonb_build_object('amount',variance_value,'percentage',case when e.total=0 then 0 else variance_value/e.total*100 end,'reason',coalesce(latest_reason,'Sin ajustes reales')),jsonb_build_object('photosProduced',photos,'paperConsumed',photos,'costPerPhoto',case when photos=0 then 0 else e.paper/photos end,'costPerHour',case when hours=0 then 0 else real_total/hours end,'revenuePerHour',case when hours=0 then 0 else final_price/hours end,'profitPerHour',case when hours=0 then 0 else gross_profit/hours end,'hours',hours,'configuredPhotoCost',cost_photo),classification_value,signature,auth.uid())on conflict(project_id,source_signature)do update set source_signature=excluded.source_signature returning id into statement_id;
  if not exists(select 1 from public.timeline_events where correlation_id='profitability:'||statement_id)then insert into public.timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by)values(p.customer_id,p.id,p.orbit_event_id,'EVENT_PROFITABILITY_UPDATED','Rentabilidad del evento actualizada','Margen final '||round(margin,1)||'%.',auth.uid(),'ORBIT','System','EVENT_PROFITABILITY_UPDATED','EventProfitability',statement_id,'Estado financiero del evento recalculado automáticamente.','profitability:'||statement_id,auth.uid());end if;
  return statement_id;
end$$;

revoke all on function public.calculate_event_operation_cost(uuid) from public,anon;
revoke all on function public.sync_event_profitability(uuid) from public,anon;
grant execute on function public.calculate_event_operation_cost(uuid),public.sync_event_profitability(uuid) to authenticated,service_role;

commit;
