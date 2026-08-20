begin;

-- One calculation path for event-level direct cost. Reporting, synchronization,
-- preview and controlled repair all consume this snapshot.
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
  select coalesce(sum(subtotal),0) into expense_net from public.expenses
  where project_id=p_project_id and deleted_at is null and status<>'CANCELLED';

  operator_value:=coalesce(real_operator,case when confirmed_settlements>0 then staff_operator end,estimate.operator);
  assembly_value:=coalesce(real_assembly,case when confirmed_settlements>0 then staff_assembly end,estimate.assembly);
  disassembly_value:=coalesce(real_disassembly,case when confirmed_settlements>0 then staff_disassembly end,estimate.disassembly);
  fuel_value:=coalesce(real_fuel,estimate.fuel);
  transport_value:=coalesce(real_transport,estimate.transport);
  scrapbook_value:=coalesce(real_scrapbook,estimate.scrapbook);
  magnets_value:=coalesce(real_magnets,estimate.magnets);
  other_value:=estimate.other_configured+real_other;
  staff_net:=operator_value+assembly_value+disassembly_value+staff_adjustments;
  staff_tax:=public.staff_company_cost_from_net(staff_net)-staff_net;

  personnel_cost:=case when truth.status='CANCELLED' then 0 else staff_net+staff_tax end;
  operational_resources_cost:=case when truth.status='CANCELLED' then 0 else
    estimate.paper+fuel_value+transport_value+scrapbook_value+magnets_value+
    estimate.branding+estimate.pens+estimate.double_sided_tape+other_value+expense_net end;
  total_operational_cost:=personnel_cost+operational_resources_cost;
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
    'paper',case when truth.status='CANCELLED' then 0 else estimate.paper end,
    'fuel',case when truth.status='CANCELLED' then 0 else fuel_value end,
    'transport',case when truth.status='CANCELLED' then 0 else transport_value end,
    'scrapbook',case when truth.status='CANCELLED' then 0 else scrapbook_value end,
    'magnets',case when truth.status='CANCELLED' then 0 else magnets_value end,
    'branding',case when truth.status='CANCELLED' then 0 else estimate.branding end,
    'brandingFaces',estimate.branding_faces,'brandingUnitCost',estimate.branding_unit_cost,
    'pens',case when truth.status='CANCELLED' then 0 else estimate.pens end,
    'doubleSidedTape',case when truth.status='CANCELLED' then 0 else estimate.double_sided_tape end,
    'registeredExpenses',case when truth.status='CANCELLED' then 0 else expense_net end,
    'other',case when truth.status='CANCELLED' then 0 else other_value end,
    'totalOperationalCost',total_operational_cost,
    'source','CANONICAL_EVENT_OPERATION_COST_V1');
  return next;
end $$;

create or replace function public.event_cost_breakdown_total(p_breakdown jsonb)
returns numeric language sql immutable set search_path=public as $$
  select coalesce(sum(coalesce((p_breakdown->>key)::numeric,0)),0)
  from unnest(array['operator','assembly','disassembly','staffAdjustments','staffTax','paper','fuel','transport','scrapbook','magnets','branding','pens','doubleSidedTape','registeredExpenses','other']) key
$$;

-- The sole writer of event-level cost and profitability.
create or replace function public.sync_event_operation_cost(p_project_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare snapshot record; revenue_value numeric:=0; profit_value numeric:=0; margin_value numeric:=0;
begin
  select * into snapshot from public.calculate_event_operation_cost(p_project_id);
  if not found then return; end if;
  select revenue into revenue_value from public.financial_event_records where project_id=p_project_id;
  profit_value:=revenue_value-snapshot.total_operational_cost;
  margin_value:=case when revenue_value>0 then profit_value/revenue_value*100 else 0 end;
  update public.financial_event_records set
    personnel_cost=snapshot.personnel_cost,
    operational_resources_cost=snapshot.operational_resources_cost,
    total_operational_cost=snapshot.total_operational_cost,
    estimated_cost=snapshot.estimated_cost,
    real_cost=snapshot.total_operational_cost,
    gross_profit=profit_value,net_profit=profit_value,
    gross_margin=margin_value,net_margin=margin_value,
    cost_breakdown=snapshot.cost_breakdown,
    calculated_at=now(),updated_at=now(),version=version+1
  where project_id=p_project_id;
end $$;

-- Compatibility wrapper: legacy callers keep the same signature, but this
-- function no longer calculates or overwrites operational cost independently.
create or replace function public.sync_financial_event(p_project_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare p public.projects%rowtype; q public.quotations%rowtype; inv public.invoices%rowtype; cancelled boolean:=false; revenue_value numeric:=0;
begin
  select * into p from public.projects where id=p_project_id;
  if not found then return; end if;
  cancelled:=p.deleted_at is not null or upper(p.status) in ('CANCELLED','CANCELED','ARCHIVED');
  select * into q from public.quotations where project_id=p_project_id and deleted_at is null and status='ACCEPTED' order by approved_at desc nulls last,created_at desc limit 1;
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

create or replace function public.preview_event_profitability_repair(p_project_ids uuid[] default null)
returns table(project_id uuid,event_id text,revenue numeric,real_cost_before numeric,real_cost_after numeric,profit_before numeric,profit_after numeric,margin_before numeric,margin_after numeric,breakdown_before jsonb,breakdown_after jsonb,requires_repair boolean)
language sql stable security definer set search_path=public as $$
  select f.project_id,f.orbit_event_id,f.revenue,f.real_cost,c.total_operational_cost,f.net_profit,
    f.revenue-c.total_operational_cost,f.net_margin,
    case when f.revenue>0 then (f.revenue-c.total_operational_cost)/f.revenue*100 else 0 end,
    f.cost_breakdown,c.cost_breakdown,
    f.real_cost<>c.total_operational_cost or f.total_operational_cost<>c.total_operational_cost
      or f.net_profit<>f.revenue-c.total_operational_cost
      or abs(f.net_margin-(case when f.revenue>0 then (f.revenue-c.total_operational_cost)/f.revenue*100 else 0 end))>0.0001
      or public.event_cost_breakdown_total(f.cost_breakdown)<>f.real_cost
      or public.event_cost_breakdown_total(c.cost_breakdown)<>c.total_operational_cost
  from public.financial_event_records f
  join public.projects p on p.id=f.project_id and p.deleted_at is null and p.record_origin='PRODUCTION'
  cross join lateral public.calculate_event_operation_cost(f.project_id) c
  where f.status<>'CANCELLED' and (p_project_ids is null or f.project_id=any(p_project_ids));
$$;

create or replace function public.execute_event_profitability_repair(p_project_ids uuid[] default null,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); is_service_backend boolean; item record; scanned integer:=0; repaired integer:=0;
begin
  is_service_backend:=coalesce(current_setting('request.jwt.claim.role',true),'')='service_role' or auth.role()='service_role';
  if not (is_service_backend or (actor is not null and public.can_administer())) then raise exception 'Solo Founder o Administración puede reparar rentabilidad de Eventos.'; end if;
  for item in select * from public.preview_event_profitability_repair(p_project_ids) loop
    scanned:=scanned+1;
    if item.requires_repair then
      repaired:=repaired+1;
      if not coalesce(p_dry_run,true) then perform public.sync_event_operation_cost(item.project_id); end if;
    end if;
  end loop;
  return jsonb_build_object('scanned',scanned,'requires_repair',repaired,'dry_run',coalesce(p_dry_run,true));
end $$;

revoke all on function public.calculate_event_operation_cost(uuid) from public,anon;
revoke all on function public.event_cost_breakdown_total(jsonb) from public,anon;
revoke all on function public.sync_event_operation_cost(uuid) from public,anon;
revoke all on function public.sync_financial_event(uuid) from public,anon;
revoke all on function public.preview_event_profitability_repair(uuid[]) from public,anon;
revoke all on function public.execute_event_profitability_repair(uuid[],boolean) from public,anon;
grant execute on function public.calculate_event_operation_cost(uuid),public.event_cost_breakdown_total(jsonb),public.preview_event_profitability_repair(uuid[]) to authenticated,service_role;
grant execute on function public.sync_event_operation_cost(uuid),public.sync_financial_event(uuid),public.execute_event_profitability_repair(uuid[],boolean) to authenticated,service_role;

-- Installation is intentionally DDL-only. Historical rows are changed only by
-- an explicit execute_event_profitability_repair(..., false) authorization.
commit;
