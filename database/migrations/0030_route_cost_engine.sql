begin;

alter table public.vehicle_fuel_logs alter column litres drop not null;
alter table public.vehicle_fuel_logs alter column gas_station drop not null;
alter table public.vehicle_fuel_logs drop constraint if exists vehicle_fuel_logs_litres_check;
alter table public.vehicle_fuel_logs add constraint vehicle_fuel_logs_litres_check check (litres is null or litres > 0);

create table if not exists public.vehicle_routes (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.operational_assets(id), route_date date not null,
  driver_staff_id uuid references public.staff(id), fuel_log_id uuid references public.vehicle_fuel_logs(id), distance numeric(14,2) check (distance is null or distance >= 0),
  notes text, status text not null default 'ACTIVE' check (status in ('ACTIVE','CANCELLED')), version integer not null default 1,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), deleted_by uuid references auth.users(id), deleted_at timestamptz
);
alter table public.vehicle_fuel_logs add column if not exists route_id uuid references public.vehicle_routes(id);
create table if not exists public.vehicle_route_events (
  id uuid primary key default gen_random_uuid(), route_id uuid not null references public.vehicle_routes(id), project_id uuid not null references public.projects(id),
  allocated_fuel_cost numeric(14,2) not null default 0 check (allocated_fuel_cost >= 0), created_by uuid references auth.users(id), created_at timestamptz not null default now(), unique(route_id,project_id)
);
alter table public.event_vehicle_assignments add column if not exists route_id uuid references public.vehicle_routes(id);
alter table public.event_vehicle_assignments add column if not exists allocated_fuel_cost numeric(14,2) not null default 0;
create index if not exists vehicle_routes_asset_date_idx on public.vehicle_routes(asset_id,route_date desc) where deleted_at is null;
create index if not exists vehicle_route_events_project_idx on public.vehicle_route_events(project_id);

drop trigger if exists vehicle_routes_touch on public.vehicle_routes; create trigger vehicle_routes_touch before update on public.vehicle_routes for each row execute function public.touch_versioned_row();
drop trigger if exists vehicle_routes_audit on public.vehicle_routes; create trigger vehicle_routes_audit after insert or update or delete on public.vehicle_routes for each row execute function public.audit_row_change();
drop trigger if exists vehicle_route_events_audit on public.vehicle_route_events; create trigger vehicle_route_events_audit after insert or update or delete on public.vehicle_route_events for each row execute function public.audit_row_change();
alter table public.vehicle_routes enable row level security; alter table public.vehicle_route_events enable row level security;
create policy vehicle_routes_internal_read on public.vehicle_routes for select using (public.is_internal_user()); create policy vehicle_routes_admin_write on public.vehicle_routes for all using (public.can_administer()) with check (public.can_administer());
create policy vehicle_route_events_internal_read on public.vehicle_route_events for select using (public.is_internal_user()); create policy vehicle_route_events_admin_write on public.vehicle_route_events for all using (public.can_administer()) with check (public.can_administer());

create or replace function public.refresh_route_financials()
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.profit_snapshots ps set
    fuel_cost=coalesce(cost.total,0),
    operational_cost=ps.crew_cost+ps.transport_cost+coalesce(cost.total,0)+ps.supplies_cost+ps.expense_cost,
    gross_margin=ps.revenue-(ps.crew_cost+ps.transport_cost+coalesce(cost.total,0)+ps.supplies_cost+ps.expense_cost),
    gross_margin_percent=case when ps.revenue=0 then 0 else ((ps.revenue-(ps.crew_cost+ps.transport_cost+coalesce(cost.total,0)+ps.supplies_cost+ps.expense_cost))/ps.revenue)*100 end,
    approval_reason='Costo de combustible distribuido automáticamente'
  from (select p.id as project_id,coalesce(sum(case when vr.id is not null then vre.allocated_fuel_cost else 0 end),0) total from public.projects p left join public.vehicle_route_events vre on vre.project_id=p.id left join public.vehicle_routes vr on vr.id=vre.route_id and vr.deleted_at is null and vr.status='ACTIVE' group by p.id) cost
  where ps.project_id=cost.project_id and ps.deleted_at is null;
end $$;

create or replace function public.distribute_vehicle_route(p_route_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare total numeric(14,2); event_count integer; route_record public.vehicle_routes; route_label text;
begin
  select * into route_record from public.vehicle_routes where id=p_route_id and deleted_at is null;
  if not found then return; end if;
  select coalesce(total_amount,0) into total from public.vehicle_fuel_logs where id=route_record.fuel_log_id;
  select count(*) into event_count from public.vehicle_route_events where route_id=p_route_id;
  if event_count=0 then return; end if;
  with ordered as (select id,row_number() over(order by project_id) rn from public.vehicle_route_events where route_id=p_route_id)
  update public.vehicle_route_events vre set allocated_fuel_cost=case when ordered.rn=event_count then total-(round(total/event_count,2)*(event_count-1)) else round(total/event_count,2) end from ordered where vre.id=ordered.id;
  route_label:='Ruta '||route_record.route_date::text;
  update public.event_vehicle_assignments set status='CANCELLED',deleted_at=now(),deleted_by=auth.uid(),updated_by=auth.uid() where route_id=p_route_id and deleted_at is null;
  insert into public.event_vehicle_assignments(project_id,asset_id,driver_staff_id,route,fuel_cost,distance,status,route_id,allocated_fuel_cost,created_by,updated_by)
  select vre.project_id,route_record.asset_id,route_record.driver_staff_id,route_label,vre.allocated_fuel_cost,coalesce(route_record.distance,0),'ASSIGNED',p_route_id,vre.allocated_fuel_cost,auth.uid(),auth.uid() from public.vehicle_route_events vre where vre.route_id=p_route_id;
  perform public.refresh_route_financials();
end $$;

create or replace function public.save_vehicle_route(p_route_id uuid,p_asset_id uuid,p_route_date date,p_driver_staff_id uuid,p_project_ids uuid[],p_receipt_path text,p_fuel_amount numeric,p_distance numeric,p_notes text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); saved_route_id uuid; fuel_id uuid; vehicle_fuel text;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Administración puede gestionar rutas.'; end if;
  if p_asset_id is null or p_route_date is null or coalesce(array_length(p_project_ids,1),0)=0 then raise exception 'La ruta requiere vehículo, fecha y eventos.'; end if;
  select fuel_type into vehicle_fuel from public.vehicle_profiles where asset_id=p_asset_id;
  if vehicle_fuel is null then raise exception 'Vehículo no encontrado.'; end if;
  if p_route_id is null then
    insert into public.vehicle_routes(asset_id,route_date,driver_staff_id,distance,notes,created_by,updated_by) values(p_asset_id,p_route_date,p_driver_staff_id,p_distance,p_notes,actor,actor) returning id into saved_route_id;
  else
    saved_route_id:=p_route_id; update public.vehicle_routes set asset_id=p_asset_id,route_date=p_route_date,driver_staff_id=p_driver_staff_id,distance=p_distance,notes=p_notes,updated_by=actor where id=saved_route_id and deleted_at is null;
    if not found then raise exception 'Ruta no encontrada.'; end if;
  end if;
  if nullif(p_receipt_path,'') is not null then
    insert into public.vehicle_fuel_logs(asset_id,fuel_date,fuel_type,litres,total_amount,receipt_path,gas_station,route_id,created_by) values(p_asset_id,p_route_date,vehicle_fuel,null,p_fuel_amount,p_receipt_path,null,saved_route_id,actor) returning id into fuel_id;
    update public.vehicle_routes set fuel_log_id=fuel_id,updated_by=actor where id=saved_route_id;
  elsif p_route_id is null then raise exception 'La ruta requiere comprobante de combustible.';
  else update public.vehicle_fuel_logs set total_amount=p_fuel_amount,fuel_date=p_route_date where id=(select fuel_log_id from public.vehicle_routes where id=saved_route_id);
  end if;
  delete from public.vehicle_route_events vre where vre.route_id=saved_route_id;
  insert into public.vehicle_route_events(route_id,project_id,created_by) select saved_route_id,project_id,actor from unnest(p_project_ids) project_id;
  perform public.distribute_vehicle_route(saved_route_id);
  return saved_route_id;
end $$;

create or replace function public.delete_vehicle_route(p_route_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Solo Administración puede eliminar rutas.'; end if;
  update public.vehicle_routes set status='CANCELLED',deleted_at=now(),deleted_by=auth.uid(),updated_by=auth.uid() where id=p_route_id and deleted_at is null;
  update public.event_vehicle_assignments set status='CANCELLED',deleted_at=now(),deleted_by=auth.uid(),updated_by=auth.uid() where route_id=p_route_id and deleted_at is null;
  perform public.refresh_route_financials();
end $$;

commit;
