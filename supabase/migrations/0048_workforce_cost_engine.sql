begin;

create or replace function public.set_staff_payment_override(p_payment_id uuid,p_operator numeric,p_assembly numeric,p_disassembly numeric,p_reason text)
returns void language plpgsql security invoker set search_path=public as $$
declare payment public.event_staff_payments%rowtype; event_code text; customer uuid;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede ajustar pagos de Staff.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'El motivo del ajuste es obligatorio.'; end if;
  if least(p_operator,p_assembly,p_disassembly)<0 then raise exception 'Los pagos no pueden ser negativos.'; end if;
  select * into payment from public.event_staff_payments where id=p_payment_id and deleted_at is null;
  if not found then raise exception 'Pago de Staff no encontrado.'; end if;
  update public.event_staff_payments set operator_payment=p_operator,assembly_payment=p_assembly,disassembly_payment=p_disassembly,
    override_reason=trim(p_reason),override_by=auth.uid(),override_at=now(),updated_by=auth.uid()
  where id=p_payment_id;
  select orbit_event_id,customer_id into event_code,customer from public.projects where id=payment.project_id;
  insert into public.timeline_events(customer_id,project_id,staff_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by)
  values(customer,payment.project_id,payment.staff_id,event_code,'STAFF_COST_ADJUSTED','Costo de Staff ajustado',
    'Operador '||p_operator||' · Montaje '||p_assembly||' · Desmontaje '||p_disassembly||' · Motivo: '||trim(p_reason),
    auth.uid(),'Founder','Operations','STAFF_COST_ADJUSTED','StaffPayment',payment.id,
    'El costo real del Staff fue ajustado con motivo obligatorio.','staff-cost:'||payment.id||':'||extract(epoch from now())::text,auth.uid());
end $$;

create or replace function public.sync_event_profitability(p_project_id uuid)returns uuid language plpgsql security definer set search_path=public as $$
declare p public.projects%rowtype;q public.quotations%rowtype;e public.estimated_cost_sheets%rowtype;s public.profitability_settings%rowtype;
  service numeric:=0;extras numeric:=0;charges numeric:=0;discounts numeric:=0;final_price numeric:=0;hours numeric:=0;photos numeric:=0;cost_photo numeric:=0;
  real_operator numeric;real_assembly numeric;real_disassembly numeric;real_fuel numeric;real_transport numeric;real_scrapbook numeric;real_magnets numeric;real_other numeric;
  staff_operator numeric:=0;staff_assembly numeric:=0;staff_disassembly numeric:=0;staff_total numeric:=0;
  real_total numeric:=0;gross_profit numeric:=0;margin numeric:=0;variance_value numeric:=0;signature text;statement_id uuid;classification_value text;latest_reason text;
begin
  select * into p from public.projects where id=p_project_id and deleted_at is null;if not found or upper(p.status) in('CANCELLED','CANCELED','ARCHIVED')then return null;end if;
  select * into q from public.quotations where project_id=p.id and status='ACCEPTED' and deleted_at is null order by created_at desc limit 1;if not found then return null;end if;
  select * into e from public.estimated_cost_sheets where project_id=p.id;if not found then return null;end if;select * into s from public.profitability_settings where settings_key='PRIMARY';
  select coalesce(sum(final_total) filter(where item_type='SERVICE'),0),coalesce(sum(final_total) filter(where item_type='EXTRA'),0) into service,extras from public.quotation_items where quotation_id=q.id;
  final_price:=coalesce(q.final_customer_price,q.grand_total,0);charges:=greatest(final_price-coalesce(q.official_price,final_price),0);discounts:=greatest(coalesce(q.official_price,final_price)-final_price,0)+coalesce(q.discount_total,0);
  select coalesce(sum(duration_hours),0),coalesce(sum(duration_hours*coalesce((m.configuration->>'estimatedPhotosPerHour')::numeric,0)),0) into hours,photos from public.project_services ps left join public.master_data_entries m on m.domain='SERVICES' and m.code=ps.service_code and m.enabled where ps.project_id=p.id;
  select coalesce(amount,0) into cost_photo from public.cost_master_entries where code='COST_PER_PHOTO' and enabled and deleted_at is null limit 1;
  select coalesce(sum(operator_payment),0),coalesce(sum(assembly_payment),0),coalesce(sum(disassembly_payment),0),coalesce(sum(total_internal_payment),0)
    into staff_operator,staff_assembly,staff_disassembly,staff_total from public.event_staff_payments where project_id=p.id and deleted_at is null and status<>'CANCELLED';
  select edited_value,reason into real_operator,latest_reason from public.financial_cost_overrides where project_id=p.id and category='OPERATOR' order by created_at desc limit 1;
  select edited_value into real_assembly from public.financial_cost_overrides where project_id=p.id and category='ASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_disassembly from public.financial_cost_overrides where project_id=p.id and category='DISASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_fuel from public.financial_cost_overrides where project_id=p.id and category='FUEL' order by created_at desc limit 1;
  select edited_value into real_transport from public.financial_cost_overrides where project_id=p.id and category='TRANSPORT' order by created_at desc limit 1;
  select edited_value into real_scrapbook from public.financial_cost_overrides where project_id=p.id and category='SCRAPBOOK' order by created_at desc limit 1;
  select edited_value into real_magnets from public.financial_cost_overrides where project_id=p.id and category='MAGNETS' order by created_at desc limit 1;
  select coalesce(sum(edited_value),0),string_agg(reason,' · ' order by created_at desc) into real_other,latest_reason from(select distinct on(category)category,edited_value,reason,created_at from public.financial_cost_overrides where project_id=p.id and category in('PARKING','TOLLS','MEALS','HOTEL','OTHER_OPERATIONAL')order by category,created_at desc)x;
  real_operator:=coalesce(nullif(staff_operator,0),real_operator,e.operator);
  real_assembly:=coalesce(nullif(staff_assembly,0),real_assembly,e.assembly);
  real_disassembly:=coalesce(nullif(staff_disassembly,0),real_disassembly,e.disassembly);
  real_total:=e.paper+real_operator+real_assembly+real_disassembly+coalesce(real_fuel,e.fuel)+coalesce(real_transport,e.transport)+coalesce(real_scrapbook,e.scrapbook)+coalesce(real_magnets,e.magnets)+coalesce(real_other,e.pens+e.double_sided_tape+e.other_configured);
  gross_profit:=final_price-real_total;margin:=case when final_price=0 then 0 else gross_profit/final_price*100 end;variance_value:=real_total-e.total;classification_value:=case when margin>=s.high_margin_threshold then'HIGHLY_PROFITABLE'when margin>=s.normal_margin_threshold then'NORMAL'else'LOW_MARGIN'end;
  signature:=md5(concat_ws('|',q.updated_at,e.updated_at,(select max(created_at)from public.financial_cost_overrides where project_id=p.id),(select max(updated_at)from public.event_staff_payments where project_id=p.id),s.updated_at,final_price,real_total,photos));
  insert into public.event_profitability_statements(project_id,orbit_event_id,revenue,estimated_costs,real_costs,profitability,variance,performance,classification,source_signature,created_by)
  values(p.id,p.orbit_event_id,jsonb_build_object('service',service,'extras',extras,'transport',q.transport_total,'commercialCharges',charges,'commercialDiscounts',discounts,'finalSalePrice',final_price,'paymentStatus',coalesce(p.finance->>'status','PENDING'),'invoiceStatus',coalesce((select status from public.invoices where project_id=p.id and deleted_at is null order by created_at desc limit 1),'NOT_ISSUED')),to_jsonb(e)-'id'-'project_id'-'orbit_event_id'-'source_snapshot',jsonb_build_object('paper',e.paper,'operator',real_operator,'assembly',real_assembly,'disassembly',real_disassembly,'staffTotal',staff_total,'fuel',coalesce(real_fuel,e.fuel),'transport',coalesce(real_transport,e.transport),'scrapbook',coalesce(real_scrapbook,e.scrapbook),'magnets',coalesce(real_magnets,e.magnets),'miscellaneous',coalesce(real_other,e.pens+e.double_sided_tape+e.other_configured),'total',real_total),jsonb_build_object('grossRevenue',final_price,'estimatedCost',e.total,'realCost',real_total,'grossProfit',gross_profit,'netProfit',gross_profit,'margin',margin),jsonb_build_object('amount',variance_value,'percentage',case when e.total=0 then 0 else variance_value/e.total*100 end,'reason',coalesce(latest_reason,'Costos de Staff sincronizados desde asignaciones')),jsonb_build_object('photosProduced',photos,'paperConsumed',photos,'costPerPhoto',case when photos=0 then 0 else e.paper/photos end,'costPerHour',case when hours=0 then 0 else real_total/hours end,'revenuePerHour',case when hours=0 then 0 else final_price/hours end,'profitPerHour',case when hours=0 then 0 else gross_profit/hours end,'hours',hours,'configuredPhotoCost',cost_photo),classification_value,signature,auth.uid())on conflict(project_id,source_signature)do update set source_signature=excluded.source_signature returning id into statement_id;
  if not exists(select 1 from public.timeline_events where correlation_id='profitability:'||statement_id)then insert into public.timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by)values(p.customer_id,p.id,p.orbit_event_id,'EVENT_PROFITABILITY_UPDATED','Rentabilidad del evento actualizada','Margen final '||round(margin,1)||'%.',auth.uid(),'ORBIT','System','EVENT_PROFITABILITY_UPDATED','EventProfitability',statement_id,'Estado financiero del evento recalculado automáticamente.','profitability:'||statement_id,auth.uid());end if;
  return statement_id;
end$$;

create or replace function public.workforce_profitability_changed()returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid:=case when tg_op='DELETE'then old.project_id else new.project_id end;
begin if target is not null then perform public.sync_event_profitability(target);end if;return case when tg_op='DELETE'then old else new end;end$$;
drop trigger if exists profitability_from_workforce on public.event_staff_payments;
create trigger profitability_from_workforce after insert or update or delete on public.event_staff_payments for each row execute function public.workforce_profitability_changed();

select public.sync_event_profitability(id)from public.projects where deleted_at is null;
commit;
