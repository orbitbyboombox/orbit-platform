begin;

-- A converted quotation remains the immutable commercial origin of its Event.
-- Cost, revenue and legacy profitability projections must keep recognizing it
-- after the ACCEPTED -> CONVERTED transition.
create or replace function public.sync_financial_event(p_project_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare p public.projects%rowtype; q public.quotations%rowtype; inv public.invoices%rowtype; cancelled boolean:=false; revenue_value numeric:=0;
begin
  select * into p from public.projects where id=p_project_id;
  if not found then return; end if;
  cancelled:=p.deleted_at is not null or upper(p.status) in ('CANCELLED','CANCELED','ARCHIVED');
  select * into q from public.quotations where project_id=p_project_id and deleted_at is null and status in('ACCEPTED','CONVERTED') order by case when status='CONVERTED' then 0 else 1 end,approved_at desc nulls last,created_at desc limit 1;
  select * into inv from public.invoices where project_id=p_project_id and deleted_at is null and status<>'CANCELLED' order by created_at desc limit 1;
  if cancelled then
    update public.invoices set status='CANCELLED',approval_reason='Reserva cancelada · sincronización financiera',updated_by=coalesce(auth.uid(),updated_by)
    where project_id=p_project_id and deleted_at is null and status not in ('CANCELLED','PAID');
  elsif q.id is not null and inv.id is null then
    insert into public.invoices(invoice_number,customer_id,project_id,quotation_id,orbit_event_id,customer_type,status,payment_term,amount,notes,created_by,updated_by)
    values('ORBIT-'||replace(p.orbit_event_id,'-',''),p.customer_id,p.id,q.id,p.orbit_event_id,case when q.customer_type='COMPANY' then 'CORPORATE' else 'PRIVATE' end,'PENDING','CASH',coalesce(q.final_customer_price,q.grand_total,0),'Generada automáticamente desde la reserva confirmada.',q.created_by,q.created_by)
    on conflict(invoice_number) do update set amount=excluded.amount,quotation_id=excluded.quotation_id,updated_at=now() returning * into inv;
  end if;
  revenue_value:=case when cancelled or q.id is null then 0 else greatest(coalesce(q.final_customer_price,q.grand_total,0)-coalesce(q.tax_total,0),0) end;
  insert into public.financial_event_records(project_id,customer_id,quotation_id,invoice_id,orbit_event_id,event_date,status,revenue,invoiced_amount,paid_amount,outstanding_balance,payment_schedule,traceability)
  values(p.id,p.customer_id,q.id,inv.id,p.orbit_event_id,p.event_date,case when cancelled then 'CANCELLED' when q.id is null then 'PENDING' else 'CONFIRMED' end,revenue_value,
    case when cancelled then 0 else coalesce(inv.amount,revenue_value) end,case when cancelled then 0 else coalesce(inv.paid_amount,0) end,
    case when cancelled then 0 else greatest(coalesce(inv.amount,revenue_value)-coalesce(inv.paid_amount,0),0) end,
    case when inv.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('invoiceId',inv.id,'dueDate',inv.due_date,'amount',inv.amount,'paid',inv.paid_amount,'status',inv.status)) end,
    jsonb_build_object('customerId',p.customer_id,'projectId',p.id,'quotationId',q.id,'invoiceId',inv.id,'source','ORBIT_FINANCIAL_TRUTH','profitabilityRevenue','NET_EXCLUDING_VAT'))
  on conflict(project_id) do update set customer_id=excluded.customer_id,quotation_id=excluded.quotation_id,invoice_id=excluded.invoice_id,orbit_event_id=excluded.orbit_event_id,event_date=excluded.event_date,status=excluded.status,revenue=excluded.revenue,invoiced_amount=excluded.invoiced_amount,paid_amount=excluded.paid_amount,outstanding_balance=excluded.outstanding_balance,payment_schedule=excluded.payment_schedule,traceability=financial_event_records.traceability||excluded.traceability,calculated_at=now(),updated_at=now(),version=financial_event_records.version+1;
  perform public.sync_event_operation_cost(p_project_id);
end $$;

create or replace function public.sync_estimated_cost_sheet(p_project_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  p public.projects%rowtype;q public.quotations%rowtype;hours numeric:=0;
  paper_value numeric:=0;operator_value numeric:=0;assembly_value numeric:=0;disassembly_value numeric:=0;
  fuel_value numeric:=0;transport_value numeric:=0;scrapbook_value numeric:=0;magnets_value numeric:=0;
  pens_value numeric:=0;tape_value numeric:=0;other_value numeric:=0;
  operator_count integer:=0;assembly_count integer:=0;disassembly_count integer:=0;cancelled boolean:=false;
begin
  select * into p from public.projects where id=p_project_id;
  if not found then return; end if;
  if exists(select 1 from public.event_operational_closures where project_id=p_project_id and status='CLOSED') then return; end if;
  cancelled:=p.deleted_at is not null or upper(p.status) in('CANCELLED','CANCELED','ARCHIVED');
  select * into q from public.quotations where project_id=p_project_id and status in('ACCEPTED','CONVERTED') and deleted_at is null order by case when status='CONVERTED' then 0 else 1 end,approved_at desc nulls last,created_at desc limit 1;
  select coalesce(max(duration_hours),0) into hours from public.project_services where project_id=p_project_id;
  select coalesce(sum(coalesce((m.configuration->>'estimatedPhotosPerHour')::numeric,0)*coalesce(ps.duration_hours,0)),0)*coalesce((select amount from public.cost_master_entries where code='COST_PER_PHOTO' and enabled and deleted_at is null limit 1),0)
    into paper_value from public.project_services ps left join public.master_data_entries m on m.domain='SERVICES' and m.code=ps.service_code and m.enabled where ps.project_id=p_project_id;
  select count(*) filter(where assignment_type='OPERATOR'),count(*) filter(where assignment_type='ASSEMBLY'),count(*) filter(where assignment_type='DISASSEMBLY')
    into operator_count,assembly_count,disassembly_count from public.assignments where project_id=p_project_id and deleted_at is null and status not in('CANCELLED','REJECTED');
  select coalesce(amount,0)*greatest(operator_count,1) into operator_value from public.cost_master_entries where code='OPERATOR_'||greatest(2,least(10,ceil(hours)::int))||'_HOURS' and enabled and deleted_at is null limit 1;
  select coalesce(amount,0)*greatest(assembly_count,1) into assembly_value from public.cost_master_entries where code='ASSEMBLY' and enabled and deleted_at is null limit 1;
  select coalesce(amount,0)*greatest(disassembly_count,1) into disassembly_value from public.cost_master_entries where code='DISASSEMBLY' and enabled and deleted_at is null limit 1;
  fuel_value:=0;
  select public.default_real_transport_cost() into transport_value;
  if q.id is not null and exists(select 1 from public.quotation_items where quotation_id=q.id and code ilike '%SCRAPBOOK%') then select coalesce(amount,0) into scrapbook_value from public.cost_master_entries where code='SCRAPBOOK_COST' and enabled and deleted_at is null limit 1; end if;
  if q.id is not null and exists(select 1 from public.quotation_items where quotation_id=q.id and code ilike '%MAGNET%') then select coalesce(amount,0) into magnets_value from public.cost_master_entries where code='MAGNETS_EVENT_COST' and enabled and deleted_at is null limit 1; end if;
  select coalesce(amount/nullif(quantity,0),0) into pens_value from public.cost_master_entries where code='PENCILS_COST' and enabled and deleted_at is null limit 1;
  select coalesce(amount/nullif(quantity,0),0) into tape_value from public.cost_master_entries where code='DOUBLE_SIDED_TAPE_COST' and enabled and deleted_at is null limit 1;
  select coalesce(sum(amount),0) into other_value from public.cost_master_entries where category='OTHER' and enabled and deleted_at is null and code not in('SCRAPBOOK_COST','MAGNETS_PURCHASE','MAGNETS_EVENT_COST','PENCILS_COST','DOUBLE_SIDED_TAPE_COST');
  paper_value:=coalesce(paper_value,0);operator_value:=coalesce(operator_value,0);assembly_value:=coalesce(assembly_value,0);disassembly_value:=coalesce(disassembly_value,0);transport_value:=coalesce(transport_value,0);scrapbook_value:=coalesce(scrapbook_value,0);magnets_value:=coalesce(magnets_value,0);pens_value:=coalesce(pens_value,0);tape_value:=coalesce(tape_value,0);other_value:=coalesce(other_value,0);
  insert into public.estimated_cost_sheets(project_id,orbit_event_id,status,paper,operator,assembly,disassembly,fuel,transport,scrapbook,magnets,pens,double_sided_tape,other_configured,total,source_snapshot,calculated_at)
  values(p.id,p.orbit_event_id,case when cancelled then 'CANCELLED' when q.id is null then 'PENDING' else 'CALCULATED' end,case when cancelled then 0 else paper_value end,case when cancelled then 0 else operator_value end,case when cancelled then 0 else assembly_value end,case when cancelled then 0 else disassembly_value end,0,case when cancelled then 0 else transport_value end,case when cancelled then 0 else scrapbook_value end,case when cancelled then 0 else magnets_value end,case when cancelled then 0 else pens_value end,case when cancelled then 0 else tape_value end,case when cancelled then 0 else other_value end,case when cancelled then 0 else paper_value+operator_value+assembly_value+disassembly_value+transport_value+scrapbook_value+magnets_value+pens_value+tape_value+other_value end,jsonb_build_object('quotationId',q.id,'quotationStatus',q.status,'serviceHours',hours,'municipality',p.city,'operatorAssignments',operator_count,'assemblyAssignments',assembly_count,'disassemblyAssignments',disassembly_count,'automaticFuel',0,'transportFuelModel','CANONICAL_V2','source','COST_MASTER_AND_MASTER_DATA'),now())
  on conflict(project_id) do update set orbit_event_id=excluded.orbit_event_id,status=excluded.status,paper=excluded.paper,operator=excluded.operator,assembly=excluded.assembly,disassembly=excluded.disassembly,fuel=excluded.fuel,transport=excluded.transport,scrapbook=excluded.scrapbook,magnets=excluded.magnets,pens=excluded.pens,double_sided_tape=excluded.double_sided_tape,other_configured=excluded.other_configured,total=excluded.total,source_snapshot=coalesce(estimated_cost_sheets.source_snapshot,'{}'::jsonb)||excluded.source_snapshot,calculated_at=now(),updated_at=now(),version=estimated_cost_sheets.version+1;
  perform public.sync_event_operation_cost(p_project_id);
end $$;

create or replace function public.sync_event_profitability(p_project_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
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
  signature:=md5(concat_ws('|',q.id,q.status,q.updated_at,e.updated_at,(select max(created_at) from public.financial_cost_overrides where project_id=p.id),(select max(updated_at) from public.expenses where project_id=p.id),(select coalesce(sum(allocated_fuel_cost),0) from public.vehicle_route_events where project_id=p.id),s.updated_at,f.updated_at,f.revenue,f.real_cost,f.cost_breakdown::text,photos));
  insert into public.event_profitability_statements(project_id,orbit_event_id,revenue,estimated_costs,real_costs,profitability,variance,performance,classification,source_signature,created_by)
  values(p.id,p.orbit_event_id,
    jsonb_build_object('service',service,'extras',extras,'transport',q.transport_total,'finalSalePrice',final_price,'profitabilityRevenue',f.revenue,'paymentStatus',coalesce(p.finance->>'status','PENDING'),'invoiceStatus',coalesce((select status from public.invoices where project_id=p.id and deleted_at is null order by created_at desc limit 1),'NOT_ISSUED')),
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
end $$;

-- Run last after the pre-existing quotation triggers. This keeps the shared
-- reservation pipeline synchronized once the immutable quote becomes CONVERTED.
create or replace function public.converted_quote_projection_changed()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='CONVERTED' and new.project_id is not null and
    (old.status is distinct from new.status or old.project_id is distinct from new.project_id) then
    perform public.sync_financial_event(new.project_id);
    perform public.sync_estimated_cost_sheet(new.project_id);
    perform public.sync_event_operation_cost(new.project_id);
    perform public.sync_event_profitability(new.project_id);
  end if;
  return new;
end $$;
drop trigger if exists zz_converted_quote_projection_sync on public.quotations;
create trigger zz_converted_quote_projection_sync after update on public.quotations
for each row execute function public.converted_quote_projection_changed();

-- Deterministic repair: open converted Events only, never closed history, and
-- only when an active invoice already exists so no billing document is created.
do $$declare item record;begin
  for item in
    select distinct q.project_id
    from public.quotations q
    join public.projects p on p.id=q.project_id and p.deleted_at is null and upper(p.status) not in('CANCELLED','CANCELED','ARCHIVED')
    join public.financial_event_records f on f.project_id=p.id
    join public.estimated_cost_sheets e on e.project_id=p.id
    where q.status='CONVERTED' and q.deleted_at is null
      and exists(select 1 from public.invoices i where i.project_id=p.id and i.deleted_at is null and i.status<>'CANCELLED')
      and not exists(select 1 from public.event_operational_closures c where c.project_id=p.id and c.status='CLOSED')
      and (f.quotation_id is distinct from q.id or f.status<>'CONFIRMED' or e.source_snapshot->>'quotationId' is distinct from q.id::text
        or coalesce((select (s.real_costs->>'fuel')::numeric from public.event_profitability_statements s where s.project_id=p.id order by s.created_at desc,s.id desc limit 1),0)
           is distinct from coalesce((f.cost_breakdown->>'fuel')::numeric,0))
  loop
    perform public.sync_financial_event(item.project_id);
    perform public.sync_estimated_cost_sheet(item.project_id);
    perform public.sync_event_operation_cost(item.project_id);
    perform public.sync_event_profitability(item.project_id);
  end loop;
end $$;

revoke all on function public.sync_financial_event(uuid),public.sync_estimated_cost_sheet(uuid),public.sync_event_profitability(uuid),public.converted_quote_projection_changed() from public,anon;
grant execute on function public.sync_financial_event(uuid),public.sync_estimated_cost_sheet(uuid),public.sync_event_profitability(uuid) to authenticated,service_role;

commit;
