-- Founder Review migration: operational planning blocks are an internal
-- projection. This migration is intentionally NOT applied to Production yet.
create table if not exists public.event_operational_blocks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sequence integer not null check (sequence > 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'PLANNING' check (status in ('PLANNING','STAFF_INCOMPLETE','RESOURCE_INCOMPLETE','READY','COMPLETED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, sequence),
  check (end_at > start_at),
  check (date_trunc('minute', start_at) = start_at and date_trunc('minute', end_at) = end_at)
);

alter table public.event_operational_requirements add column if not exists block_id uuid references public.event_operational_blocks(id) on delete restrict;
alter table public.event_staff_requirements add column if not exists block_id uuid references public.event_operational_blocks(id) on delete restrict;
alter table public.assignments add column if not exists block_id uuid references public.event_operational_blocks(id) on delete restrict;
alter table public.asset_assignments add column if not exists block_id uuid references public.event_operational_blocks(id) on delete restrict;
alter table public.event_staff_payments add column if not exists block_id uuid references public.event_operational_blocks(id) on delete restrict;

-- Staff cost/payable projection is additive. A missing block tariff is visible
-- as REVIEW_REQUIRED; it is never silently split or priced as a four-hour job.
create table if not exists public.event_staff_block_costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  block_id uuid not null references public.event_operational_blocks(id) on delete restrict,
  staff_id uuid not null references public.staff(id),
  settlement_id uuid references public.event_staff_payments(id) on delete restrict,
  role text not null,
  amount numeric(14,2),
  status text not null default 'REVIEW_REQUIRED' check (status in ('RESOLVED','REVIEW_REQUIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (block_id, staff_id, role)
);
create index if not exists event_staff_block_costs_month_idx on public.event_staff_block_costs(staff_id, project_id, created_at);
alter table public.event_staff_block_costs enable row level security;
create policy event_staff_block_costs_admin_read on public.event_staff_block_costs for select to authenticated using (public.can_administer());
create policy event_staff_block_costs_admin_write on public.event_staff_block_costs for all to authenticated using (public.can_administer()) with check (public.can_administer());

create or replace view public.staff_monthly_block_costs with (security_invoker=true) as
select cost.staff_id, date_trunc('month', project.event_date)::date accounting_month,
       cost.block_id, cost.role, cost.status, count(*) line_count, coalesce(sum(cost.amount),0) amount
from public.event_staff_block_costs cost
join public.projects project on project.id=cost.project_id
group by cost.staff_id, date_trunc('month', project.event_date)::date, cost.block_id, cost.role, cost.status;
grant select on public.staff_monthly_block_costs to authenticated;

-- Block-aware adapter for the existing canonical capacity engine. Legacy
-- events continue through the exact preflight_reservation_capacity body;
-- segmented events evaluate the same service_asset_type_mappings by each
-- operational window and take the weighted temporal peak.
create or replace function public.preflight_event_blocks_capacity(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare case_required numeric:=0; bbox_required numeric:=0; case_pool integer:=0; bbox_pool integer:=0; case_committed numeric:=0; bbox_committed numeric:=0; block_count integer:=0; block record; overlap jsonb:='[]'::jsonb;
begin
  select count(*) into block_count from public.event_operational_blocks where project_id=p_project_id;
  if block_count=0 then return public.preflight_reservation_capacity_legacy(p_project_id); end if;
  for block in select id,start_at,end_at from public.event_operational_blocks where project_id=p_project_id order by sequence loop
    select coalesce(sum(ps.quantity*m.units_per_service) filter(where m.asset_type='CASE'),0), coalesce(sum(ps.quantity*m.units_per_service) filter(where m.asset_type='BBOX360'),0) into case_required,bbox_required from public.project_services ps join public.service_asset_type_mappings m on m.service_code=ps.service_code and m.enabled and m.asset_type in ('CASE','BBOX360') where ps.project_id=p_project_id;
    select count(*) filter(where asset_type='CASE' and status not in('MAINTENANCE','OUT_OF_SERVICE')), count(*) filter(where asset_type='BBOX360' and status not in('MAINTENANCE','OUT_OF_SERVICE')) into case_pool,bbox_pool from public.operational_assets where deleted_at is null;
    select coalesce(sum(x.case_qty),0), coalesce(sum(x.bbox_qty),0) into case_committed,bbox_committed from (select p.id, coalesce(sum(ps.quantity*m.units_per_service) filter(where m.asset_type='CASE'),0) case_qty, coalesce(sum(ps.quantity*m.units_per_service) filter(where m.asset_type='BBOX360'),0) bbox_qty from public.crm_reservations r join public.projects p on p.id=r.project_id cross join lateral public.event_operational_window(p.id) w left join public.project_services ps on ps.project_id=p.id left join public.service_asset_type_mappings m on m.service_code=ps.service_code and m.enabled and m.asset_type in('CASE','BBOX360') where r.status='CONFIRMED' and p.deleted_at is null and r.project_id<>p_project_id and w.window_start<block.end_at and block.start_at<w.window_end group by p.id) x;
    overlap:=overlap||jsonb_build_array(jsonb_build_object('blockId',block.id,'required',jsonb_build_object('CASE',case_required,'BBOX360',bbox_required),'committed',jsonb_build_object('CASE',case_committed,'BBOX360',bbox_committed),'available',jsonb_build_object('CASE',greatest(case_pool-case_committed-case_required,0),'BBOX360',greatest(bbox_pool-bbox_committed-bbox_required,0))));
    if case_required+case_committed>case_pool or bbox_required+bbox_committed>bbox_pool then return jsonb_build_object('status','UNAVAILABLE','reasonCode','BLOCK_CAPACITY_EXHAUSTED','humanSafeReason','Uno de los bloques no tiene capacidad disponible.','blocks',overlap); end if;
  end loop;
  if exists(select 1 from public.event_operational_blocks a join public.event_operational_blocks b on a.project_id=b.project_id and a.id<b.id and a.start_at<b.end_at and b.start_at<a.end_at where a.project_id=p_project_id and (case_required*2+case_committed>case_pool or bbox_required*2+bbox_committed>bbox_pool)) then
    return jsonb_build_object('status','UNAVAILABLE','reasonCode','BLOCK_CAPACITY_EXHAUSTED','humanSafeReason','La superposición de bloques supera la capacidad.','blocks',overlap);
  end if;
  return jsonb_build_object('status','AVAILABLE','reasonCode','CAPACITY_CONFIRMED','humanSafeReason','Disponibilidad confirmada para todos los bloques.','blocks',overlap);
end $$;

alter function public.preflight_reservation_capacity(uuid) rename to preflight_reservation_capacity_legacy;
create or replace function public.preflight_reservation_capacity(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
begin
  if exists(select 1 from public.event_operational_blocks where project_id=p_project_id) then return public.preflight_event_blocks_capacity(p_project_id); end if;
  return public.preflight_reservation_capacity_legacy(p_project_id);
end $$;

-- If a review environment already created the first draft of this migration,
-- replace its nullable FK constraints with the dependency-preserving RESTRICT
-- contract instead of leaving an ON DELETE SET NULL escape hatch behind.
do $$
declare constraint_name text; table_name text;
begin
  foreach table_name in array array['event_operational_requirements','event_staff_requirements','assignments','asset_assignments'] loop
    select con.conname into constraint_name
      from pg_constraint con
      join pg_attribute att on att.attrelid=con.conrelid and att.attnum=any(con.conkey)
     where con.conrelid=('public.'||table_name)::regclass
       and con.contype='f' and att.attname='block_id'
       and con.confrelid='public.event_operational_blocks'::regclass
     limit 1;
    if constraint_name is not null then execute format('alter table public.%I drop constraint %I', table_name, constraint_name); end if;
    execute format('alter table public.%I add constraint %I foreign key (block_id) references public.event_operational_blocks(id) on delete restrict', table_name, table_name||'_block_id_fkey');
  end loop;
exception when duplicate_object then null;
end $$;

create index if not exists event_operational_blocks_project_sequence_idx on public.event_operational_blocks(project_id, sequence);
create index if not exists event_operational_blocks_project_window_idx on public.event_operational_blocks(project_id, start_at, end_at);
create index if not exists event_operational_requirements_block_idx on public.event_operational_requirements(block_id) where block_id is not null;
create index if not exists event_staff_requirements_block_idx on public.event_staff_requirements(block_id) where block_id is not null;
create index if not exists assignments_block_idx on public.assignments(block_id) where block_id is not null;
create index if not exists asset_assignments_block_idx on public.asset_assignments(block_id) where block_id is not null;

alter table public.event_operational_blocks enable row level security;
drop policy if exists event_operational_blocks_founder_all on public.event_operational_blocks;
create policy event_operational_blocks_founder_all on public.event_operational_blocks
  for all to authenticated using (public.can_administer()) with check (public.can_administer());

-- Staff never write planning data. Their assigned-block view is exposed by the
-- existing authenticated staff portal projection; this policy deliberately
-- grants only SELECT and is scoped to assignments tied to the current user.
drop policy if exists event_operational_blocks_assigned_staff_read on public.event_operational_blocks;
create policy event_operational_blocks_assigned_staff_read on public.event_operational_blocks
  for select to authenticated
  using (exists (
    select 1 from public.assignments assignment
    where assignment.block_id = event_operational_blocks.id
      and assignment.staff_id = auth.uid()
      and assignment.deleted_at is null
      and assignment.status not in ('CANCELLED','REJECTED')
  ));

drop trigger if exists event_operational_blocks_audit on public.event_operational_blocks;
create trigger event_operational_blocks_audit after insert or update or delete on public.event_operational_blocks
  for each row execute function public.audit_row_change();

comment on table public.event_operational_blocks is 'Internal event planning blocks. Does not create a second quote, reservation, Drive folder or Calendar event.';

create or replace function public.delete_event_operational_block(p_project_id uuid, p_block_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  if not exists (select 1 from public.event_operational_blocks where id=p_block_id and project_id=p_project_id) then
    raise exception 'Bloque operacional no encontrado.';
  end if;
  if exists (select 1 from public.event_operational_requirements where block_id=p_block_id)
     or exists (select 1 from public.event_staff_requirements where block_id=p_block_id)
     or exists (select 1 from public.assignments where block_id=p_block_id and deleted_at is null)
     or exists (select 1 from public.asset_assignments where block_id=p_block_id) then
    raise exception 'El bloque tiene dependencias y no puede eliminarse.';
  end if;
  delete from public.event_operational_blocks where id=p_block_id and project_id=p_project_id;
end $$;

create or replace function public.reorder_event_operational_blocks(p_project_id uuid, p_ordered_ids uuid[])
returns void language plpgsql security invoker set search_path=public as $$
declare item uuid; position integer := 0;
begin
  if not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  if (select count(*) from public.event_operational_blocks where project_id=p_project_id)
     <> coalesce(array_length(p_ordered_ids,1),0) then
    raise exception 'El orden recibido no coincide con los bloques del evento.';
  end if;
  foreach item in array p_ordered_ids loop
    position := position + 1;
    update public.event_operational_blocks set sequence=1000000+position where id=item and project_id=p_project_id;
    if not found then raise exception 'El orden incluye un bloque ajeno al evento.'; end if;
  end loop;
  update public.event_operational_blocks block set sequence=positioned.position
  from unnest(p_ordered_ids) with ordinality as positioned(id,position)
  where block.id=positioned.id and block.project_id=p_project_id;
end $$;

revoke all on function public.delete_event_operational_block(uuid,uuid), public.reorder_event_operational_blocks(uuid,uuid[]) from public, anon;
grant execute on function public.delete_event_operational_block(uuid,uuid), public.reorder_event_operational_blocks(uuid,uuid[]) to authenticated;
