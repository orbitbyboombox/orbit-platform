begin;

alter table public.cost_master_entries
  drop constraint if exists cost_master_entries_category_check;
alter table public.cost_master_entries
  add constraint cost_master_entries_category_check
  check(category in('PAPER','PHOTO_PRODUCTION','OPERATOR','ASSEMBLY','FUEL','TRANSPORT_OVERRIDE','BRANDING','OTHER'));

alter table public.estimated_cost_sheets
  add column if not exists branding numeric(14,2) not null default 0,
  add column if not exists branding_faces numeric(14,2) not null default 0,
  add column if not exists branding_unit_cost numeric(14,2) not null default 0,
  add column if not exists branding_rate_locked boolean not null default false;

create or replace function public.event_branding_faces(p_project_id uuid)
returns numeric
language sql
stable
security definer
set search_path=public
as $$
  with configured as (
    select greatest(coalesce((p.operations->>'brandingFaces')::numeric,0),0) as faces
    from public.projects p where p.id=p_project_id
  ), extras as (
    select case
      when regexp_replace(value,'[^0-9]','','g')='' then 1
      else regexp_replace(value,'[^0-9]','','g')::numeric
    end as faces
    from public.project_services ps
    cross join lateral jsonb_array_elements_text(coalesce(ps.extras,'[]'::jsonb)) item(value)
    where ps.project_id=p_project_id and upper(value) like '%BRANDING%'
  )
  select greatest(
    coalesce((select max(faces) from configured),0),
    coalesce((select max(faces) from extras),0)
  );
$$;

create or replace function public.sync_estimated_cost_sheet(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.projects%rowtype;
  q public.quotations%rowtype;
  existing public.estimated_cost_sheets%rowtype;
  hours numeric:=0;
  paper_value numeric:=0;
  operator_value numeric:=0;
  assembly_value numeric:=0;
  disassembly_value numeric:=0;
  fuel_value numeric:=0;
  transport_value numeric:=0;
  scrapbook_value numeric:=0;
  magnets_value numeric:=0;
  branding_value numeric:=0;
  branding_faces_value numeric:=0;
  branding_unit_value numeric:=0;
  pens_value numeric:=0;
  tape_value numeric:=0;
  other_value numeric:=0;
  operator_count integer:=0;
  assembly_count integer:=0;
  disassembly_count integer:=0;
  cancelled boolean:=false;
begin
  select * into p from public.projects where id=p_project_id;
  if not found then return; end if;
  select * into existing from public.estimated_cost_sheets where project_id=p_project_id;
  cancelled:=p.deleted_at is not null or upper(p.status) in('CANCELLED','CANCELED','ARCHIVED');
  select * into q from public.quotations where project_id=p_project_id and status='ACCEPTED' and deleted_at is null order by approved_at desc nulls last,created_at desc limit 1;
  select coalesce(max(duration_hours),0) into hours from public.project_services where project_id=p_project_id;
  select coalesce(sum(coalesce((m.configuration->>'estimatedPhotosPerHour')::numeric,0)*coalesce(ps.duration_hours,0)),0)*coalesce((select amount from public.cost_master_entries where code='COST_PER_PHOTO' and enabled and deleted_at is null limit 1),0) into paper_value from public.project_services ps left join public.master_data_entries m on m.domain='SERVICES' and m.code=ps.service_code and m.enabled where ps.project_id=p_project_id;
  select count(*) filter(where assignment_type='OPERATOR'),count(*) filter(where assignment_type='ASSEMBLY'),count(*) filter(where assignment_type='DISASSEMBLY') into operator_count,assembly_count,disassembly_count from public.assignments where project_id=p_project_id and deleted_at is null and status not in('CANCELLED','REJECTED');
  select coalesce(amount,0)*greatest(operator_count,1) into operator_value from public.cost_master_entries where code='OPERATOR_'||greatest(2,least(10,ceil(hours)::int))||'_HOURS' and enabled and deleted_at is null limit 1;
  select coalesce(amount,0)*greatest(assembly_count,1) into assembly_value from public.cost_master_entries where code='ASSEMBLY' and enabled and deleted_at is null limit 1;
  select coalesce(amount,0)*greatest(disassembly_count,1) into disassembly_value from public.cost_master_entries where code='DISASSEMBLY' and enabled and deleted_at is null limit 1;
  select coalesce(amount,0) into fuel_value from public.cost_master_entries where code='DEFAULT_FUEL_COST' and enabled and deleted_at is null limit 1;
  select coalesce(unit_price,0) into transport_value from public.commercial_prices where category='TRANSPORT' and enabled and deleted_at is null and coalesce(rules->'municipalities','[]'::jsonb)?p.city order by display_order limit 1;
  if q.id is not null and exists(select 1 from public.quotation_items where quotation_id=q.id and code ilike '%SCRAPBOOK%') then select coalesce(amount,0) into scrapbook_value from public.cost_master_entries where code='SCRAPBOOK_COST' and enabled and deleted_at is null limit 1; end if;
  if q.id is not null and exists(select 1 from public.quotation_items where quotation_id=q.id and code ilike '%MAGNET%') then select coalesce(amount,0) into magnets_value from public.cost_master_entries where code='MAGNETS_EVENT_COST' and enabled and deleted_at is null limit 1; end if;
  select public.event_branding_faces(p_project_id) into branding_faces_value;
  if branding_faces_value>0 then
    if existing.branding_rate_locked then
      branding_unit_value:=coalesce(existing.branding_unit_cost,0);
    else
      select coalesce(amount,0) into branding_unit_value from public.cost_master_entries where code='BRANDING_FACE' and enabled and deleted_at is null limit 1;
    end if;
    branding_value:=branding_faces_value*coalesce(branding_unit_value,0);
  else
    branding_unit_value:=0;
  end if;
  select coalesce(amount/nullif(quantity,0),0) into pens_value from public.cost_master_entries where code='PENCILS_COST' and enabled and deleted_at is null limit 1;
  select coalesce(amount/nullif(quantity,0),0) into tape_value from public.cost_master_entries where code='DOUBLE_SIDED_TAPE_COST' and enabled and deleted_at is null limit 1;
  select coalesce(sum(amount),0) into other_value from public.cost_master_entries where category='OTHER' and enabled and deleted_at is null and code not in('SCRAPBOOK_COST','MAGNETS_PURCHASE','MAGNETS_EVENT_COST','PENCILS_COST','DOUBLE_SIDED_TAPE_COST');
  paper_value:=coalesce(paper_value,0);operator_value:=coalesce(operator_value,0);assembly_value:=coalesce(assembly_value,0);disassembly_value:=coalesce(disassembly_value,0);fuel_value:=coalesce(fuel_value,0);transport_value:=coalesce(transport_value,0);scrapbook_value:=coalesce(scrapbook_value,0);magnets_value:=coalesce(magnets_value,0);branding_value:=coalesce(branding_value,0);pens_value:=coalesce(pens_value,0);tape_value:=coalesce(tape_value,0);other_value:=coalesce(other_value,0);
  insert into public.estimated_cost_sheets(project_id,orbit_event_id,status,paper,operator,assembly,disassembly,fuel,transport,scrapbook,magnets,branding,branding_faces,branding_unit_cost,branding_rate_locked,pens,double_sided_tape,other_configured,total,source_snapshot,calculated_at)
  values(p.id,p.orbit_event_id,case when cancelled then 'CANCELLED' when q.id is null then 'PENDING' else 'CALCULATED' end,case when cancelled then 0 else paper_value end,case when cancelled then 0 else operator_value end,case when cancelled then 0 else assembly_value end,case when cancelled then 0 else disassembly_value end,case when cancelled then 0 else fuel_value end,case when cancelled then 0 else transport_value end,case when cancelled then 0 else scrapbook_value end,case when cancelled then 0 else magnets_value end,case when cancelled then 0 else branding_value end,branding_faces_value,branding_unit_value,branding_faces_value>0,case when cancelled then 0 else pens_value end,case when cancelled then 0 else tape_value end,case when cancelled then 0 else other_value end,case when cancelled then 0 else paper_value+operator_value+assembly_value+disassembly_value+fuel_value+transport_value+scrapbook_value+magnets_value+branding_value+pens_value+tape_value+other_value end,jsonb_build_object('quotationId',q.id,'serviceHours',hours,'municipality',p.city,'operatorAssignments',operator_count,'assemblyAssignments',assembly_count,'disassemblyAssignments',disassembly_count,'branding',jsonb_build_object('code','BRANDING_FACE','faces',branding_faces_value,'unitCost',branding_unit_value,'netCost',branding_value),'source','COST_MASTER_AND_MASTER_DATA'),now())
  on conflict(project_id) do update set orbit_event_id=excluded.orbit_event_id,status=excluded.status,paper=excluded.paper,operator=excluded.operator,assembly=excluded.assembly,disassembly=excluded.disassembly,fuel=excluded.fuel,transport=excluded.transport,scrapbook=excluded.scrapbook,magnets=excluded.magnets,branding=excluded.branding,branding_faces=excluded.branding_faces,branding_unit_cost=excluded.branding_unit_cost,branding_rate_locked=excluded.branding_rate_locked,pens=excluded.pens,double_sided_tape=excluded.double_sided_tape,other_configured=excluded.other_configured,total=excluded.total,source_snapshot=excluded.source_snapshot,calculated_at=now(),updated_at=now(),version=estimated_cost_sheets.version+1;
end;
$$;

create or replace function public.sync_event_operation_cost(p_project_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  estimate public.estimated_cost_sheets%rowtype;truth public.financial_event_records%rowtype;
  staff_operator numeric:=0;staff_assembly numeric:=0;staff_disassembly numeric:=0;
  real_operator numeric;real_assembly numeric;real_disassembly numeric;real_fuel numeric;real_transport numeric;real_scrapbook numeric;real_magnets numeric;real_other numeric:=0;
  operator_value numeric:=0;assembly_value numeric:=0;disassembly_value numeric:=0;fuel_value numeric:=0;transport_value numeric:=0;scrapbook_value numeric:=0;magnets_value numeric:=0;other_value numeric:=0;
  personnel numeric:=0;resources numeric:=0;total_value numeric:=0;profit_value numeric:=0;margin_value numeric:=0;breakdown jsonb;
begin
  select * into estimate from public.estimated_cost_sheets where project_id=p_project_id;
  select * into truth from public.financial_event_records where project_id=p_project_id;
  if not found or estimate.id is null then return;end if;
  select coalesce(sum(operator_payment),0),coalesce(sum(assembly_payment),0),coalesce(sum(disassembly_payment),0) into staff_operator,staff_assembly,staff_disassembly from public.event_staff_payments where project_id=p_project_id and deleted_at is null and status<>'CANCELLED';
  select edited_value into real_operator from public.financial_cost_overrides where project_id=p_project_id and category='OPERATOR' order by created_at desc limit 1;
  select edited_value into real_assembly from public.financial_cost_overrides where project_id=p_project_id and category='ASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_disassembly from public.financial_cost_overrides where project_id=p_project_id and category='DISASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_fuel from public.financial_cost_overrides where project_id=p_project_id and category='FUEL' order by created_at desc limit 1;
  select edited_value into real_transport from public.financial_cost_overrides where project_id=p_project_id and category='TRANSPORT' order by created_at desc limit 1;
  select edited_value into real_scrapbook from public.financial_cost_overrides where project_id=p_project_id and category='SCRAPBOOK' order by created_at desc limit 1;
  select edited_value into real_magnets from public.financial_cost_overrides where project_id=p_project_id and category='MAGNETS' order by created_at desc limit 1;
  select coalesce(sum(edited_value),0) into real_other from(select distinct on(category)category,edited_value from public.financial_cost_overrides where project_id=p_project_id and category in('PARKING','TOLLS','MEALS','HOTEL','OTHER_OPERATIONAL','MISCELLANEOUS') order by category,created_at desc) latest;
  operator_value:=coalesce(real_operator,nullif(staff_operator,0),estimate.operator);assembly_value:=coalesce(real_assembly,nullif(staff_assembly,0),estimate.assembly);disassembly_value:=coalesce(real_disassembly,nullif(staff_disassembly,0),estimate.disassembly);fuel_value:=coalesce(real_fuel,estimate.fuel);transport_value:=coalesce(real_transport,estimate.transport);scrapbook_value:=coalesce(real_scrapbook,estimate.scrapbook);magnets_value:=coalesce(real_magnets,estimate.magnets);other_value:=case when real_other>0 then real_other else estimate.other_configured end;
  personnel:=operator_value+assembly_value+disassembly_value;
  resources:=estimate.paper+fuel_value+transport_value+scrapbook_value+magnets_value+estimate.branding+estimate.pens+estimate.double_sided_tape+other_value;
  total_value:=case when truth.status='CANCELLED' then 0 else personnel+resources end;profit_value:=case when truth.status='CANCELLED' then 0 else truth.revenue-total_value end;margin_value:=case when truth.revenue=0 then 0 else profit_value/truth.revenue*100 end;
  breakdown:=jsonb_build_object('personnelCost',personnel,'operator',operator_value,'assembly',assembly_value,'disassembly',disassembly_value,'operationalResourcesCost',resources,'paper',estimate.paper,'fuel',fuel_value,'transport',transport_value,'scrapbook',scrapbook_value,'magnets',magnets_value,'branding',estimate.branding,'brandingFaces',estimate.branding_faces,'brandingUnitCost',estimate.branding_unit_cost,'pens',estimate.pens,'doubleSidedTape',estimate.double_sided_tape,'other',other_value,'totalOperationalCost',total_value,'source','COST_MASTER_STAFF_AND_REAL_OVERRIDES');
  update public.financial_event_records set personnel_cost=case when status='CANCELLED'then 0 else personnel end,operational_resources_cost=case when status='CANCELLED'then 0 else resources end,total_operational_cost=total_value,estimated_cost=case when status='CANCELLED'then 0 else estimate.total end,real_cost=total_value,gross_profit=profit_value,net_profit=profit_value,gross_margin=margin_value,net_margin=margin_value,cost_breakdown=breakdown,calculated_at=now(),updated_at=now(),version=version+1 where project_id=p_project_id;
end;
$$;

insert into public.cost_master_entries(category,code,label,amount,quantity,unit,enabled,display_order,metadata,approval_reason)
values('BRANDING','BRANDING_FACE','Branding por cara',8500,1,'CLP/CARA',true,190,'{"description":"Costo operacional neto por cara de Branding. IVA se informa por separado.","vatRate":19,"amountIsNet":true,"snapshotPerEvent":true}'::jsonb,'RC-COST-01 · costo operacional oficial BOOMBOX')
on conflict(code) do update set category='BRANDING',label=excluded.label,unit=excluded.unit,metadata=cost_master_entries.metadata||excluded.metadata,deleted_at=null,deleted_by=null;

-- Events that existed before this resource was introduced retain their
-- historical zero Branding cost. A new selection later unlocks and snapshots
-- the then-current Cost Master value.
update public.estimated_cost_sheets e set
  branding_faces=public.event_branding_faces(e.project_id),
  branding=0,
  branding_unit_cost=0,
  branding_rate_locked=public.event_branding_faces(e.project_id)>0;

select public.sync_estimated_cost_sheet(id) from public.projects where deleted_at is null;

revoke all on function public.event_branding_faces(uuid) from public,anon;
grant execute on function public.event_branding_faces(uuid) to authenticated,service_role;

commit;
