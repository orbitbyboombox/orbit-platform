begin;

alter table public.estimated_cost_sheets
  add column if not exists branding_rate_locked boolean not null default false;

-- Migration 0111 was applied before the historical guard was added. Restore
-- pre-existing Events to the cost they held before BRANDING_FACE existed.
update public.estimated_cost_sheets e set
  branding=0,
  branding_unit_cost=0,
  branding_rate_locked=e.branding_faces>0
where e.created_at < '2026-08-13 19:50:26+00'::timestamptz;

-- Keep the canonical function definition in sync with 0111 while making zero
-- a valid, locked historical rate.
create or replace function public.sync_estimated_cost_sheet(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare p public.projects%rowtype;q public.quotations%rowtype;existing public.estimated_cost_sheets%rowtype;hours numeric:=0;paper_value numeric:=0;operator_value numeric:=0;assembly_value numeric:=0;disassembly_value numeric:=0;fuel_value numeric:=0;transport_value numeric:=0;scrapbook_value numeric:=0;magnets_value numeric:=0;branding_value numeric:=0;branding_faces_value numeric:=0;branding_unit_value numeric:=0;pens_value numeric:=0;tape_value numeric:=0;other_value numeric:=0;operator_count integer:=0;assembly_count integer:=0;disassembly_count integer:=0;cancelled boolean:=false;
begin
  select * into p from public.projects where id=p_project_id;if not found then return;end if;
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
  if q.id is not null and exists(select 1 from public.quotation_items where quotation_id=q.id and code ilike '%SCRAPBOOK%')then select coalesce(amount,0) into scrapbook_value from public.cost_master_entries where code='SCRAPBOOK_COST' and enabled and deleted_at is null limit 1;end if;
  if q.id is not null and exists(select 1 from public.quotation_items where quotation_id=q.id and code ilike '%MAGNET%')then select coalesce(amount,0) into magnets_value from public.cost_master_entries where code='MAGNETS_EVENT_COST' and enabled and deleted_at is null limit 1;end if;
  select public.event_branding_faces(p_project_id) into branding_faces_value;
  if branding_faces_value>0 then if existing.branding_rate_locked then branding_unit_value:=coalesce(existing.branding_unit_cost,0);else select coalesce(amount,0) into branding_unit_value from public.cost_master_entries where code='BRANDING_FACE' and enabled and deleted_at is null limit 1;end if;branding_value:=branding_faces_value*coalesce(branding_unit_value,0);else branding_unit_value:=0;end if;
  select coalesce(amount/nullif(quantity,0),0) into pens_value from public.cost_master_entries where code='PENCILS_COST' and enabled and deleted_at is null limit 1;
  select coalesce(amount/nullif(quantity,0),0) into tape_value from public.cost_master_entries where code='DOUBLE_SIDED_TAPE_COST' and enabled and deleted_at is null limit 1;
  select coalesce(sum(amount),0) into other_value from public.cost_master_entries where category='OTHER' and enabled and deleted_at is null and code not in('SCRAPBOOK_COST','MAGNETS_PURCHASE','MAGNETS_EVENT_COST','PENCILS_COST','DOUBLE_SIDED_TAPE_COST');
  paper_value:=coalesce(paper_value,0);operator_value:=coalesce(operator_value,0);assembly_value:=coalesce(assembly_value,0);disassembly_value:=coalesce(disassembly_value,0);fuel_value:=coalesce(fuel_value,0);transport_value:=coalesce(transport_value,0);scrapbook_value:=coalesce(scrapbook_value,0);magnets_value:=coalesce(magnets_value,0);branding_value:=coalesce(branding_value,0);pens_value:=coalesce(pens_value,0);tape_value:=coalesce(tape_value,0);other_value:=coalesce(other_value,0);
  insert into public.estimated_cost_sheets(project_id,orbit_event_id,status,paper,operator,assembly,disassembly,fuel,transport,scrapbook,magnets,branding,branding_faces,branding_unit_cost,branding_rate_locked,pens,double_sided_tape,other_configured,total,source_snapshot,calculated_at)values(p.id,p.orbit_event_id,case when cancelled then'CANCELLED'when q.id is null then'PENDING'else'CALCULATED'end,case when cancelled then 0 else paper_value end,case when cancelled then 0 else operator_value end,case when cancelled then 0 else assembly_value end,case when cancelled then 0 else disassembly_value end,case when cancelled then 0 else fuel_value end,case when cancelled then 0 else transport_value end,case when cancelled then 0 else scrapbook_value end,case when cancelled then 0 else magnets_value end,case when cancelled then 0 else branding_value end,branding_faces_value,branding_unit_value,branding_faces_value>0,case when cancelled then 0 else pens_value end,case when cancelled then 0 else tape_value end,case when cancelled then 0 else other_value end,case when cancelled then 0 else paper_value+operator_value+assembly_value+disassembly_value+fuel_value+transport_value+scrapbook_value+magnets_value+branding_value+pens_value+tape_value+other_value end,jsonb_build_object('quotationId',q.id,'serviceHours',hours,'municipality',p.city,'operatorAssignments',operator_count,'assemblyAssignments',assembly_count,'disassemblyAssignments',disassembly_count,'branding',jsonb_build_object('code','BRANDING_FACE','faces',branding_faces_value,'unitCost',branding_unit_value,'netCost',branding_value),'source','COST_MASTER_AND_MASTER_DATA'),now())on conflict(project_id)do update set orbit_event_id=excluded.orbit_event_id,status=excluded.status,paper=excluded.paper,operator=excluded.operator,assembly=excluded.assembly,disassembly=excluded.disassembly,fuel=excluded.fuel,transport=excluded.transport,scrapbook=excluded.scrapbook,magnets=excluded.magnets,branding=excluded.branding,branding_faces=excluded.branding_faces,branding_unit_cost=excluded.branding_unit_cost,branding_rate_locked=excluded.branding_rate_locked,pens=excluded.pens,double_sided_tape=excluded.double_sided_tape,other_configured=excluded.other_configured,total=excluded.total,source_snapshot=excluded.source_snapshot,calculated_at=now(),updated_at=now(),version=estimated_cost_sheets.version+1;
end;
$$;

select public.sync_estimated_cost_sheet(id) from public.projects where deleted_at is null;

commit;
