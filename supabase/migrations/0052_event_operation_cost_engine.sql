begin;

alter table public.financial_event_records
  add column if not exists personnel_cost numeric(14,2) not null default 0,
  add column if not exists operational_resources_cost numeric(14,2) not null default 0,
  add column if not exists total_operational_cost numeric(14,2) not null default 0;

create or replace function public.sync_event_operation_cost(p_project_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  estimate public.estimated_cost_sheets%rowtype;
  truth public.financial_event_records%rowtype;
  staff_operator numeric:=0;staff_assembly numeric:=0;staff_disassembly numeric:=0;
  real_operator numeric;real_assembly numeric;real_disassembly numeric;real_fuel numeric;real_transport numeric;
  real_scrapbook numeric;real_magnets numeric;real_other numeric:=0;
  operator_value numeric:=0;assembly_value numeric:=0;disassembly_value numeric:=0;
  fuel_value numeric:=0;transport_value numeric:=0;scrapbook_value numeric:=0;magnets_value numeric:=0;other_value numeric:=0;
  personnel numeric:=0;resources numeric:=0;total_value numeric:=0;profit_value numeric:=0;margin_value numeric:=0;
  breakdown jsonb;
begin
  select * into estimate from public.estimated_cost_sheets where project_id=p_project_id;
  select * into truth from public.financial_event_records where project_id=p_project_id;
  if not found or estimate.id is null then return;end if;

  select coalesce(sum(operator_payment),0),coalesce(sum(assembly_payment),0),coalesce(sum(disassembly_payment),0)
    into staff_operator,staff_assembly,staff_disassembly
    from public.event_staff_payments where project_id=p_project_id and deleted_at is null and status<>'CANCELLED';
  select edited_value into real_operator from public.financial_cost_overrides where project_id=p_project_id and category='OPERATOR' order by created_at desc limit 1;
  select edited_value into real_assembly from public.financial_cost_overrides where project_id=p_project_id and category='ASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_disassembly from public.financial_cost_overrides where project_id=p_project_id and category='DISASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_fuel from public.financial_cost_overrides where project_id=p_project_id and category='FUEL' order by created_at desc limit 1;
  select edited_value into real_transport from public.financial_cost_overrides where project_id=p_project_id and category='TRANSPORT' order by created_at desc limit 1;
  select edited_value into real_scrapbook from public.financial_cost_overrides where project_id=p_project_id and category='SCRAPBOOK' order by created_at desc limit 1;
  select edited_value into real_magnets from public.financial_cost_overrides where project_id=p_project_id and category='MAGNETS' order by created_at desc limit 1;
  select coalesce(sum(edited_value),0) into real_other from(
    select distinct on(category)category,edited_value from public.financial_cost_overrides
    where project_id=p_project_id and category in('PARKING','TOLLS','MEALS','HOTEL','OTHER_OPERATIONAL','MISCELLANEOUS')
    order by category,created_at desc
  ) latest;

  operator_value:=coalesce(real_operator,nullif(staff_operator,0),estimate.operator);
  assembly_value:=coalesce(real_assembly,nullif(staff_assembly,0),estimate.assembly);
  disassembly_value:=coalesce(real_disassembly,nullif(staff_disassembly,0),estimate.disassembly);
  fuel_value:=coalesce(real_fuel,estimate.fuel);
  transport_value:=coalesce(real_transport,estimate.transport);
  scrapbook_value:=coalesce(real_scrapbook,estimate.scrapbook);
  magnets_value:=coalesce(real_magnets,estimate.magnets);
  other_value:=case when real_other>0 then real_other else estimate.other_configured end;
  personnel:=operator_value+assembly_value+disassembly_value;
  resources:=estimate.paper+fuel_value+transport_value+scrapbook_value+magnets_value+estimate.pens+estimate.double_sided_tape+other_value;
  total_value:=case when truth.status='CANCELLED' then 0 else personnel+resources end;
  profit_value:=case when truth.status='CANCELLED' then 0 else truth.revenue-total_value end;
  margin_value:=case when truth.revenue=0 then 0 else profit_value/truth.revenue*100 end;
  breakdown:=jsonb_build_object(
    'personnelCost',personnel,'operator',operator_value,'assembly',assembly_value,'disassembly',disassembly_value,
    'operationalResourcesCost',resources,'paper',estimate.paper,'fuel',fuel_value,'transport',transport_value,
    'scrapbook',scrapbook_value,'magnets',magnets_value,'pens',estimate.pens,'doubleSidedTape',estimate.double_sided_tape,
    'other',other_value,'totalOperationalCost',total_value,'source','COST_MASTER_STAFF_AND_REAL_OVERRIDES'
  );
  update public.financial_event_records set personnel_cost=case when status='CANCELLED'then 0 else personnel end,
    operational_resources_cost=case when status='CANCELLED'then 0 else resources end,total_operational_cost=total_value,
    estimated_cost=case when status='CANCELLED'then 0 else estimate.total end,real_cost=total_value,
    gross_profit=profit_value,net_profit=profit_value,gross_margin=margin_value,net_margin=margin_value,
    cost_breakdown=breakdown,calculated_at=now(),updated_at=now(),version=version+1
  where project_id=p_project_id;
end$$;

create or replace function public.event_operation_cost_source_changed()returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid:=case when tg_op='DELETE'then old.project_id else new.project_id end;
begin if target is not null then perform public.sync_event_operation_cost(target);perform public.sync_event_profitability(target);end if;return case when tg_op='DELETE'then old else new end;end$$;

drop trigger if exists zz_event_operation_cost_sync on public.estimated_cost_sheets;
create trigger zz_event_operation_cost_sync after insert or update on public.estimated_cost_sheets for each row execute function public.event_operation_cost_source_changed();
drop trigger if exists zz_event_operation_cost_sync on public.event_staff_payments;
create trigger zz_event_operation_cost_sync after insert or update or delete on public.event_staff_payments for each row execute function public.event_operation_cost_source_changed();
drop trigger if exists zz_event_operation_cost_sync on public.financial_cost_overrides;
create trigger zz_event_operation_cost_sync after insert or update or delete on public.financial_cost_overrides for each row execute function public.event_operation_cost_source_changed();

create or replace view public.event_operation_cost_intelligence with(security_invoker=true)as
select f.project_id,f.orbit_event_id,f.event_date,p.name as event_name,p.city as municipality,
  coalesce((select string_agg(ps.service_code,' + ' order by ps.service_code)from public.project_services ps where ps.project_id=f.project_id),'Sin servicio')as services,
  f.revenue,f.personnel_cost,f.operational_resources_cost,f.total_operational_cost,f.net_profit,f.net_margin,
  coalesce(f.cost_breakdown->>'operator','0')::numeric as operator_cost
from public.financial_event_records f join public.projects p on p.id=f.project_id where f.status='CONFIRMED';

grant select on public.event_operation_cost_intelligence to authenticated;
revoke all on function public.sync_event_operation_cost(uuid)from public,anon;
grant execute on function public.sync_event_operation_cost(uuid)to authenticated;

select public.sync_event_operation_cost(id)from public.projects where deleted_at is null;
commit;
