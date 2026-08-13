begin;

-- Customer debt remains gross, but profitability is always net of VAT.
create or replace function public.enforce_event_net_profitability()
returns trigger language plpgsql security definer set search_path=public as $$
declare customer_total numeric:=0;vat_value numeric:=0;
begin
  if new.status='CANCELLED' then new.revenue:=0;
  else
    select coalesce(q.final_customer_price,q.grand_total,0),coalesce(q.tax_total,0) into customer_total,vat_value
    from public.quotations q where q.id=new.quotation_id and q.deleted_at is null;
    new.revenue:=greatest(coalesce(customer_total,0)-coalesce(vat_value,0),0);
  end if;
  new.gross_profit:=new.revenue-coalesce(new.real_cost,new.total_operational_cost,0);new.net_profit:=new.gross_profit;
  new.gross_margin:=case when new.revenue=0 then 0 else new.gross_profit/new.revenue*100 end;new.net_margin:=new.gross_margin;
  new.traceability:=coalesce(new.traceability,'{}'::jsonb)||jsonb_build_object('profitabilityRevenue','NET_EXCLUDING_VAT','customerTotal',customer_total,'vatExcluded',vat_value);
  return new;
end$$;
drop trigger if exists enforce_event_net_profitability on public.financial_event_records;
create trigger enforce_event_net_profitability before insert or update on public.financial_event_records for each row execute function public.enforce_event_net_profitability();

alter table public.cost_master_entries drop constraint if exists cost_master_entries_category_check;
alter table public.cost_master_entries add constraint cost_master_entries_category_check check(category in('PAPER','PHOTO_PRODUCTION','OPERATOR','ASSEMBLY','FUEL','TRANSPORT_OVERRIDE','BRANDING','STAFF_TAX','OTHER'));
insert into public.cost_master_entries(category,code,label,amount,quantity,unit,enabled,display_order,metadata,approval_reason)
values('STAFF_TAX','STAFF_WITHHOLDING_RATE','Retención boleta de honorarios',15.25,1,'PERCENT',true,195,'{"description":"Retención de boletas de honorarios vigente para 2026. El costo empresa bruto se obtiene desde el pago líquido.","year":2026,"amountIsPercent":true}'::jsonb,'Corrección de verdad financiera · tasa SII 2026')
on conflict(code) do update set category='STAFF_TAX',label=excluded.label,amount=excluded.amount,unit=excluded.unit,metadata=cost_master_entries.metadata||excluded.metadata,deleted_at=null,deleted_by=null;

create or replace function public.staff_withholding_rate()returns numeric language sql stable security definer set search_path=public as $$
select coalesce((select amount/100 from public.cost_master_entries where code='STAFF_WITHHOLDING_RATE' and enabled and deleted_at is null limit 1),0.1525)$$;
create or replace function public.staff_company_cost_from_net(p_net numeric)returns numeric language sql stable security definer set search_path=public as $$
select round(greatest(coalesce(p_net,0),0)/nullif(1-public.staff_withholding_rate(),0),2)$$;

create or replace function public.sync_event_operation_cost(p_project_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
 estimate public.estimated_cost_sheets%rowtype;truth public.financial_event_records%rowtype;
 staff_operator numeric:=0;staff_assembly numeric:=0;staff_disassembly numeric:=0;staff_adjustments numeric:=0;confirmed_settlements integer:=0;
 real_operator numeric;real_assembly numeric;real_disassembly numeric;real_fuel numeric;real_transport numeric;real_scrapbook numeric;real_magnets numeric;real_other numeric:=0;
 operator_value numeric:=0;assembly_value numeric:=0;disassembly_value numeric:=0;fuel_value numeric:=0;transport_value numeric:=0;scrapbook_value numeric:=0;magnets_value numeric:=0;other_value numeric:=0;
 expense_net numeric:=0;staff_net numeric:=0;staff_tax numeric:=0;personnel numeric:=0;resources numeric:=0;total_value numeric:=0;profit_value numeric:=0;margin_value numeric:=0;estimated_tax numeric:=0;breakdown jsonb;
begin
 select * into estimate from public.estimated_cost_sheets where project_id=p_project_id;select * into truth from public.financial_event_records where project_id=p_project_id;
 if not found or estimate.id is null then return;end if;
 select count(*),coalesce(sum(operator_payment),0),coalesce(sum(assembly_payment),0),coalesce(sum(disassembly_payment),0) into confirmed_settlements,staff_operator,staff_assembly,staff_disassembly from public.event_staff_payments where project_id=p_project_id and deleted_at is null and status='CONFIRMED';
 select coalesce(sum(a.amount),0) into staff_adjustments from public.event_staff_settlement_adjustments a join public.event_staff_payments s on s.id=a.settlement_id where s.project_id=p_project_id and s.deleted_at is null and s.status='CONFIRMED';
 select edited_value into real_operator from public.financial_cost_overrides where project_id=p_project_id and category='OPERATOR' order by created_at desc limit 1;
 select edited_value into real_assembly from public.financial_cost_overrides where project_id=p_project_id and category='ASSEMBLY' order by created_at desc limit 1;
 select edited_value into real_disassembly from public.financial_cost_overrides where project_id=p_project_id and category='DISASSEMBLY' order by created_at desc limit 1;
 select edited_value into real_fuel from public.financial_cost_overrides where project_id=p_project_id and category='FUEL' order by created_at desc limit 1;
 select edited_value into real_transport from public.financial_cost_overrides where project_id=p_project_id and category='TRANSPORT' order by created_at desc limit 1;
 select edited_value into real_scrapbook from public.financial_cost_overrides where project_id=p_project_id and category='SCRAPBOOK' order by created_at desc limit 1;
 select edited_value into real_magnets from public.financial_cost_overrides where project_id=p_project_id and category='MAGNETS' order by created_at desc limit 1;
 select coalesce(sum(edited_value),0) into real_other from(select distinct on(category)category,edited_value from public.financial_cost_overrides where project_id=p_project_id and category in('PARKING','TOLLS','MEALS','HOTEL','OTHER_OPERATIONAL','MISCELLANEOUS') order by category,created_at desc)latest;
 select coalesce(sum(subtotal),0) into expense_net from public.expenses where project_id=p_project_id and deleted_at is null and status<>'CANCELLED';
 operator_value:=coalesce(real_operator,case when confirmed_settlements>0 then staff_operator end,estimate.operator);assembly_value:=coalesce(real_assembly,case when confirmed_settlements>0 then staff_assembly end,estimate.assembly);disassembly_value:=coalesce(real_disassembly,case when confirmed_settlements>0 then staff_disassembly end,estimate.disassembly);
 fuel_value:=coalesce(real_fuel,estimate.fuel);transport_value:=coalesce(real_transport,estimate.transport);scrapbook_value:=coalesce(real_scrapbook,estimate.scrapbook);magnets_value:=coalesce(real_magnets,estimate.magnets);other_value:=estimate.other_configured+real_other;
 staff_net:=operator_value+assembly_value+disassembly_value+staff_adjustments;staff_tax:=public.staff_company_cost_from_net(staff_net)-staff_net;personnel:=staff_net+staff_tax;
 resources:=estimate.paper+fuel_value+transport_value+scrapbook_value+magnets_value+estimate.branding+estimate.pens+estimate.double_sided_tape+other_value+expense_net;
 total_value:=case when truth.status='CANCELLED'then 0 else personnel+resources end;profit_value:=case when truth.status='CANCELLED'then 0 else truth.revenue-total_value end;margin_value:=case when truth.revenue=0 then 0 else profit_value/truth.revenue*100 end;
 estimated_tax:=public.staff_company_cost_from_net(estimate.operator+estimate.assembly+estimate.disassembly)-(estimate.operator+estimate.assembly+estimate.disassembly);
 breakdown:=jsonb_build_object('personnelCost',personnel,'operator',operator_value,'assembly',assembly_value,'disassembly',disassembly_value,'staffAdjustments',staff_adjustments,'staffTax',staff_tax,'staffTaxRate',public.staff_withholding_rate()*100,'operationalResourcesCost',resources,'paper',estimate.paper,'fuel',fuel_value,'transport',transport_value,'scrapbook',scrapbook_value,'magnets',magnets_value,'branding',estimate.branding,'brandingFaces',estimate.branding_faces,'brandingUnitCost',estimate.branding_unit_cost,'pens',estimate.pens,'doubleSidedTape',estimate.double_sided_tape,'other',other_value,'registeredExpenses',expense_net,'totalOperationalCost',total_value,'source','NET_REVENUE_COST_MASTER_EVENT_SETTLEMENT_AND_NET_EXPENSES');
 update public.financial_event_records set personnel_cost=case when status='CANCELLED'then 0 else personnel end,operational_resources_cost=case when status='CANCELLED'then 0 else resources end,total_operational_cost=total_value,estimated_cost=case when status='CANCELLED'then 0 else estimate.total+estimated_tax end,real_cost=total_value,gross_profit=profit_value,net_profit=profit_value,gross_margin=margin_value,net_margin=margin_value,cost_breakdown=breakdown,calculated_at=now(),updated_at=now(),version=version+1 where project_id=p_project_id;
end$$;

create or replace function public.staff_financial_detail_changed()returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid;begin
 if tg_table_name='event_staff_settlement_adjustments' then select project_id into target from public.event_staff_payments where id=case when tg_op='DELETE'then old.settlement_id else new.settlement_id end;else target:=case when tg_op='DELETE'then old.project_id else new.project_id end;end if;
 if target is not null then perform public.sync_event_operation_cost(target);perform public.sync_event_profitability(target);end if;return case when tg_op='DELETE'then old else new end;
end$$;
drop trigger if exists zz_event_operation_cost_sync on public.event_staff_settlement_adjustments;
create trigger zz_event_operation_cost_sync after insert or update or delete on public.event_staff_settlement_adjustments for each row execute function public.staff_financial_detail_changed();
drop trigger if exists zz_event_operation_cost_sync on public.expenses;
create trigger zz_event_operation_cost_sync after insert or update or delete on public.expenses for each row execute function public.staff_financial_detail_changed();

do $$declare item record;begin for item in select id from public.projects where deleted_at is null loop perform public.sync_financial_event(item.id);perform public.sync_estimated_cost_sheet(item.id);perform public.sync_event_operation_cost(item.id);perform public.sync_event_profitability(item.id);end loop;end$$;
revoke all on function public.staff_withholding_rate() from public,anon;revoke all on function public.staff_company_cost_from_net(numeric) from public,anon;
grant execute on function public.staff_withholding_rate(),public.staff_company_cost_from_net(numeric) to authenticated,service_role;
commit;
