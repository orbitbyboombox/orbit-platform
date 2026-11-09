-- ORBIT FINANZAS: cierre canónico de papel AM/PM, honorarios excluyendo asignaciones canceladas,
-- y estado de factura pagada. La lógica mantiene fallback de snapshots para otros eventos.
-- Aplicado y verificado en la base de datos el 2026-11-09, CCU ORB-2026-268105.
-- Sin escrituras de stock, liquidaciones, facturas ni registros de pago.

-- calculate_event_paper_cost
CREATE OR REPLACE FUNCTION public.calculate_event_paper_cost(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  paper_row record;
  unit_row record;
  total_usage numeric := 0;
  total_cost numeric := 0;
  review_required boolean := false;
  format_details jsonb := '[]'::jsonb;
  source_complete boolean := false;
begin
  select (
    (select count(*) from public.event_paper_snapshots s where s.project_id=p_project_id and s.paper_required and s.status in ('CONFIRMED','OVERRIDDEN')) > 0
    and (select count(*) from public.event_operational_blocks b where b.project_id=p_project_id) > 1
    and (select count(*) from public.event_box_paper_block_closeouts c where c.project_id=p_project_id) =
      (select count(*) from public.event_paper_snapshots s where s.project_id=p_project_id and s.paper_required and s.status in ('CONFIRMED','OVERRIDDEN')) *
      (select count(*) from public.event_operational_blocks b where b.project_id=p_project_id)
    and (select count(*) from public.event_box_paper_block_closeouts c
      join public.event_operational_blocks b on b.id=c.block_id
      where c.project_id=p_project_id and b.sequence=(select max(z.sequence) from public.event_operational_blocks z where z.project_id=p_project_id)
        and b.status='COMPLETED' and c.inventory_reconciled_at is not null) =
      (select count(*) from public.event_paper_snapshots s where s.project_id=p_project_id and s.paper_required and s.status in ('CONFIRMED','OVERRIDDEN'))
  ) into source_complete;
  for paper_row in
    select raw.format_key, coalesce(sum(raw.usage),0) as usage, count(*) as snapshot_count
    from (
      select coalesce(nullif(trim(s.format_key),''), nullif(trim(s.black_box_paper_format),''),'UNKNOWN') as format_key,
        s.event_usage as usage
      from public.event_paper_snapshots s
      where not source_complete and s.project_id=p_project_id and s.status in ('CONFIRMED','OVERRIDDEN')
        and s.event_usage is not null
      union all
      select coalesce(nullif(trim(s.format_key),''),
        case when s.paper_variant in ('NORMAL_4X6','PRECUT_4X6') then '4X6' else null end,
        nullif(trim(s.black_box_paper_format),''),'UNKNOWN') as format_key,
        c.used::numeric as usage
      from public.event_box_paper_block_closeouts c
      join public.event_paper_snapshots s on s.project_id=c.project_id and s.box_asset_id=c.asset_id
      where source_complete and c.project_id=p_project_id and s.paper_required
        and s.status in ('CONFIRMED','OVERRIDDEN')
    ) raw
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
$function$
;

-- event_staff_payment_role_totals
CREATE OR REPLACE FUNCTION public.event_staff_payment_role_totals(p_project_id uuid)
 RETURNS TABLE(operator numeric, assembly numeric, disassembly numeric, adjustments numeric, payment_rows integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    coalesce(sum(coalesce(p.override_operator_payment, p.operator_payment, 0)), 0),
    coalesce(sum(coalesce(p.override_assembly_payment, p.assembly_payment, 0)), 0),
    coalesce(sum(coalesce(p.override_disassembly_payment, p.disassembly_payment, 0)), 0),
    coalesce((select sum(a.amount) from public.event_staff_settlement_adjustments a join public.event_staff_payments ap on ap.id=a.settlement_id where ap.project_id=p_project_id and ap.deleted_at is null and ap.status <> 'CANCELLED' and exists(select 1 from public.assignments valid_adjustment where valid_adjustment.id=ap.assignment_id and valid_adjustment.project_id=p_project_id and valid_adjustment.deleted_at is null and valid_adjustment.status not in ('CANCELLED','CANCELED'))), 0),
    count(*)::integer
  from public.event_staff_payments p
  join public.assignments valid_assignment on valid_assignment.id=p.assignment_id and valid_assignment.project_id=p_project_id
    and valid_assignment.deleted_at is null and valid_assignment.status not in ('CANCELLED','CANCELED')
  where p.project_id=p_project_id and p.deleted_at is null and p.status <> 'CANCELLED';
$function$
;

-- sync_event_profitability
CREATE OR REPLACE FUNCTION public.sync_event_profitability(p_project_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.projects%rowtype;q public.quotations%rowtype;e public.estimated_cost_sheets%rowtype;
  f public.financial_event_records%rowtype;s public.profitability_settings%rowtype;
  service numeric:=0;extras numeric:=0;final_price numeric:=0;hours numeric:=0;photos numeric:=0;cost_photo numeric:=0;
  variance_value numeric:=0;signature text;statement_id uuid;classification_value text;latest_reason text;
begin
  select * into p from public.projects where id=p_project_id and deleted_at is null;
  if not found or upper(p.status) in('CANCELLED','CANCELED','ARCHIVED') then return null; end if;
  select * into q from public.quotations where project_id=p.id and status in('ACCEPTED','CONVERTED') and deleted_at is null order by case when status='CONVERTED' then 0 else 1 end,created_at desc limit 1;
  if not found then return null; end if;
  select * into e from public.estimated_cost_sheets where project_id=p.id;
  if not found then return null; end if;
  perform public.sync_event_operation_cost(p.id);
  select * into f from public.financial_event_records where project_id=p.id;
  if not found then return null; end if;
  select * into s from public.profitability_settings where settings_key='PRIMARY';
  select coalesce(sum(final_total) filter(where item_type='SERVICE'),0),coalesce(sum(final_total) filter(where item_type='EXTRA'),0) into service,extras from public.quotation_items where quotation_id=q.id;
  select coalesce(sum(duration_hours),0),coalesce(sum(duration_hours*coalesce((m.configuration->>'estimatedPhotosPerHour')::numeric,0)),0) into hours,photos from public.project_services ps left join public.master_data_entries m on m.domain='SERVICES' and m.code=ps.service_code and m.enabled where ps.project_id=p.id;
  select coalesce(amount,0) into cost_photo from public.cost_master_entries where code='COST_PER_PHOTO' and enabled and deleted_at is null limit 1;
  select string_agg(reason,' · ' order by created_at desc) into latest_reason from(select distinct on(category) category,reason,created_at from public.financial_cost_overrides where project_id=p.id order by category,created_at desc) latest;
  final_price:=coalesce(q.final_customer_price,q.grand_total,0);variance_value:=f.real_cost-f.estimated_cost;
  classification_value:=case when f.net_margin>=s.high_margin_threshold then 'HIGHLY_PROFITABLE' when f.net_margin>=s.normal_margin_threshold then 'NORMAL' else 'LOW_MARGIN' end;
  signature:=md5(concat_ws('|',q.id,q.status,q.updated_at,e.updated_at,(select max(created_at) from public.financial_cost_overrides where project_id=p.id),(select max(updated_at) from public.expenses where project_id=p.id),(select coalesce(sum(allocated_fuel_cost),0) from public.vehicle_route_events where project_id=p.id),s.updated_at,f.revenue,f.real_cost,f.cost_breakdown::text,photos));
  insert into public.event_profitability_statements(project_id,orbit_event_id,revenue,estimated_costs,real_costs,profitability,variance,performance,classification,source_signature,created_by)
  values(p.id,p.orbit_event_id,
    jsonb_build_object('service',service,'extras',extras,'transport',q.transport_total,'finalSalePrice',final_price,'profitabilityRevenue',f.revenue,'paymentStatus',coalesce((select case when i.amount>0 and i.paid_amount>=i.amount then 'PAID' else i.status end from public.invoices i where i.project_id=p.id and i.deleted_at is null order by i.created_at desc limit 1),coalesce(p.finance->>'status','PENDING')),'invoiceStatus',coalesce((select status from public.invoices where project_id=p.id and deleted_at is null order by created_at desc limit 1),'NOT_ISSUED')),
    to_jsonb(e)-'id'-'project_id'-'orbit_event_id'-'source_snapshot',
    f.cost_breakdown||jsonb_build_object('total',f.real_cost),
    jsonb_build_object('grossRevenue',f.revenue,'estimatedCost',f.estimated_cost,'realCost',f.real_cost,'grossProfit',f.gross_profit,'netProfit',f.net_profit,'margin',f.net_margin),
    jsonb_build_object('amount',variance_value,'percentage',case when f.estimated_cost=0 then 0 else variance_value/f.estimated_cost*100 end,'reason',coalesce(latest_reason,'Sin ajustes reales')),
    jsonb_build_object('photosProduced',photos,'paperConsumed',photos,'costPerPhoto',case when photos=0 then 0 else coalesce((f.cost_breakdown->>'paper')::numeric,0)/photos end,'costPerHour',case when hours=0 then 0 else f.real_cost/hours end,'revenuePerHour',case when hours=0 then 0 else f.revenue/hours end,'profitPerHour',case when hours=0 then 0 else f.net_profit/hours end,'hours',hours,'configuredPhotoCost',cost_photo),
    classification_value,signature,auth.uid())
  on conflict(project_id,source_signature) do update set real_costs=excluded.real_costs,profitability=excluded.profitability,variance=excluded.variance,performance=excluded.performance,classification=excluded.classification
  returning id into statement_id;
  if not exists(select 1 from public.timeline_events where correlation_id='profitability:'||statement_id) then
    insert into public.timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by)
    values(p.customer_id,p.id,p.orbit_event_id,'EVENT_PROFITABILITY_UPDATED','Rentabilidad del evento actualizada','Margen final '||round(f.net_margin,1)||'%.',auth.uid(),'ORBIT','System','EVENT_PROFITABILITY_UPDATED','EventProfitability',statement_id,'Estado financiero del evento recalculado automáticamente.','profitability:'||statement_id,auth.uid());
  end if;
  return statement_id;
end $function$
;
