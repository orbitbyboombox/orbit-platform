begin;

create extension if not exists btree_gist;

alter table public.project_operational_contracts
  add column if not exists logistics_mode text not null default 'NOT_REQUIRED'
    check(logistics_mode in('NOT_REQUIRED','COMPANY_VEHICLE','STAFF_OWN','EXTERNAL')),
  add column if not exists logistics_status text not null default 'NOT_REQUIRED'
    check(logistics_status in('NOT_REQUIRED','PENDING','PLANNED','IN_PROGRESS','COMPLETED'));

create table if not exists public.vehicle_trips(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  assignment_id uuid references public.event_vehicle_assignments(id),
  asset_id uuid references public.operational_assets(id),
  driver_staff_id uuid references public.staff(id),
  driver_profile_id uuid references public.profiles(id),
  driver_name text,
  trip_type text not null check(trip_type in('DELIVERY_ASSEMBLY','PICKUP_DISASSEMBLY','EVENT_OPERATION','RETURN')),
  sequence integer not null default 1 check(sequence>0),
  origin text not null,
  destination text not null,
  planned_start_at timestamptz not null,
  planned_end_at timestamptz not null,
  odometer_start numeric(14,1),
  odometer_end numeric(14,1),
  distance numeric(14,1),
  meeting_point text,
  instructions text,
  status text not null default 'PLANNED' check(status in('PLANNED','IN_PROGRESS','ARRIVED','COMPLETED','CANCELLED')),
  started_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  version integer not null default 1,
  created_by uuid references auth.users(id),created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),updated_at timestamptz not null default now(),
  deleted_by uuid references auth.users(id),deleted_at timestamptz,
  check(planned_end_at>planned_start_at),
  check(asset_id is not null or nullif(trim(coalesce(driver_name,'')),'') is not null),
  check(odometer_end is null or odometer_start is null or odometer_end>=odometer_start)
);

alter table public.vehicle_trips drop constraint if exists vehicle_trips_asset_window_excl;
alter table public.vehicle_trips add constraint vehicle_trips_asset_window_excl exclude using gist(
  asset_id with =,tstzrange(planned_start_at,planned_end_at,'[)') with &&
) where(asset_id is not null and deleted_at is null and status in('PLANNED','IN_PROGRESS','ARRIVED'));
create index if not exists vehicle_trips_project_idx on public.vehicle_trips(project_id,sequence) where deleted_at is null;
create index if not exists vehicle_trips_driver_idx on public.vehicle_trips(driver_staff_id,planned_start_at) where deleted_at is null;

alter table public.expenses add column if not exists vehicle_trip_id uuid references public.vehicle_trips(id);
create index if not exists expenses_vehicle_trip_idx on public.expenses(vehicle_trip_id) where deleted_at is null;

alter table public.vehicle_trips enable row level security;
drop policy if exists vehicle_trips_internal_read on public.vehicle_trips;
create policy vehicle_trips_internal_read on public.vehicle_trips for select using(public.is_internal_user());
drop policy if exists vehicle_trips_admin_write on public.vehicle_trips;
create policy vehicle_trips_admin_write on public.vehicle_trips for all using(public.can_administer()) with check(public.can_administer());
drop trigger if exists vehicle_trips_touch on public.vehicle_trips;
create trigger vehicle_trips_touch before update on public.vehicle_trips for each row execute function public.touch_versioned_row();
drop trigger if exists vehicle_trips_audit on public.vehicle_trips;
create trigger vehicle_trips_audit after insert or update or delete on public.vehicle_trips for each row execute function public.audit_row_change();

create or replace function public.refresh_event_logistics(p_project_id uuid,p_actor_id uuid default auth.uid())
returns jsonb language plpgsql security definer set search_path=public as $$
declare mode text; next_status text; trips integer; complete_trips integer;
begin
  select logistics_mode into mode from public.project_operational_contracts where project_id=p_project_id for update;
  if mode is null then raise exception 'Contrato operacional no preparado.'; end if;
  select count(*),count(*)filter(where status='COMPLETED') into trips,complete_trips from public.vehicle_trips where project_id=p_project_id and deleted_at is null and status<>'CANCELLED';
  next_status:=case when mode='NOT_REQUIRED' then 'NOT_REQUIRED' when trips=0 then 'PENDING' when complete_trips=trips then 'COMPLETED' when exists(select 1 from public.vehicle_trips where project_id=p_project_id and deleted_at is null and status in('IN_PROGRESS','ARRIVED')) then 'IN_PROGRESS' else 'PLANNED' end;
  update public.project_operational_contracts set logistics_status=next_status,updated_by=p_actor_id where project_id=p_project_id;
  return jsonb_build_object('mode',mode,'status',next_status,'trips',trips);
end $$;

create or replace function public.save_event_logistics_trip(
  p_project_id uuid,p_trip_id uuid,p_asset_id uuid,p_driver_staff_id uuid,p_driver_name text,
  p_trip_type text,p_sequence integer,p_origin text,p_destination text,p_planned_start_at timestamptz,
  p_planned_end_at timestamptz,p_meeting_point text,p_instructions text
) returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); trip_id uuid; saved_assignment_id uuid; conflict record;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Administración puede gestionar logística.'; end if;
  if not exists(select 1 from public.projects where id=p_project_id and deleted_at is null) then raise exception 'Evento no encontrado.'; end if;
  if p_asset_id is not null and not exists(select 1 from public.vehicle_profiles vp join public.operational_assets a on a.id=vp.asset_id where vp.asset_id=p_asset_id and vp.operational_status='OPERATIONAL' and a.status='AVAILABLE' and a.deleted_at is null) then raise exception 'VEHÍCULO NO DISPONIBLE · Estado operacional incompatible.'; end if;
  if p_asset_id is not null then
    select vt.planned_start_at,vt.planned_end_at,p.name into conflict from public.vehicle_trips vt join public.projects p on p.id=vt.project_id where vt.asset_id=p_asset_id and vt.project_id<>p_project_id and vt.deleted_at is null and vt.status in('PLANNED','IN_PROGRESS','ARRIVED') and tstzrange(vt.planned_start_at,vt.planned_end_at,'[)')&&tstzrange(p_planned_start_at,p_planned_end_at,'[)') limit 1;
    if found then raise exception 'VEHÍCULO NO DISPONIBLE · Asignado a otro Evento entre % y %.',to_char(conflict.planned_start_at at time zone 'America/Santiago','HH24:MI'),to_char(conflict.planned_end_at at time zone 'America/Santiago','HH24:MI'); end if;
    select id into saved_assignment_id from public.event_vehicle_assignments where project_id=p_project_id and asset_id=p_asset_id and status='ASSIGNED' and deleted_at is null limit 1;
    if saved_assignment_id is null then insert into public.event_vehicle_assignments(project_id,asset_id,driver_staff_id,route,status,created_by,updated_by) values(p_project_id,p_asset_id,p_driver_staff_id,p_origin||' → '||p_destination,'ASSIGNED',actor,actor) returning id into saved_assignment_id; end if;
  end if;
  if p_trip_id is null then
    insert into public.vehicle_trips(project_id,assignment_id,asset_id,driver_staff_id,driver_profile_id,driver_name,trip_type,sequence,origin,destination,planned_start_at,planned_end_at,meeting_point,instructions,created_by,updated_by)
    values(p_project_id,saved_assignment_id,p_asset_id,p_driver_staff_id,case when p_driver_staff_id is null and nullif(trim(p_driver_name),'') is null then actor end,nullif(trim(p_driver_name),''),p_trip_type,greatest(p_sequence,1),trim(p_origin),trim(p_destination),p_planned_start_at,p_planned_end_at,nullif(trim(p_meeting_point),''),nullif(trim(p_instructions),''),actor,actor) returning id into trip_id;
  else
    update public.vehicle_trips set assignment_id=saved_assignment_id,asset_id=p_asset_id,driver_staff_id=p_driver_staff_id,driver_name=nullif(trim(p_driver_name),''),trip_type=p_trip_type,sequence=greatest(p_sequence,1),origin=trim(p_origin),destination=trim(p_destination),planned_start_at=p_planned_start_at,planned_end_at=p_planned_end_at,meeting_point=nullif(trim(p_meeting_point),''),instructions=nullif(trim(p_instructions),''),updated_by=actor where id=p_trip_id and project_id=p_project_id and deleted_at is null returning id into trip_id;
    if trip_id is null then raise exception 'Viaje no encontrado.'; end if;
  end if;
  perform public.refresh_event_logistics(p_project_id,actor);perform public.refresh_event_operational_readiness(p_project_id,actor);return trip_id;
exception when exclusion_violation then raise exception 'VEHÍCULO NO DISPONIBLE · Existe una asignación incompatible en esa ventana.';
end $$;

create or replace function public.set_event_logistics_mode(p_project_id uuid,p_mode text)
returns void language plpgsql security definer set search_path=public as $$ begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Solo Administración puede gestionar logística.'; end if;
  if p_mode not in('NOT_REQUIRED','COMPANY_VEHICLE','STAFF_OWN','EXTERNAL') then raise exception 'Modo logístico inválido.'; end if;
  update public.project_operational_contracts set logistics_mode=p_mode,updated_by=auth.uid() where project_id=p_project_id;
  perform public.refresh_event_logistics(p_project_id,auth.uid());perform public.refresh_event_operational_readiness(p_project_id,auth.uid());
end $$;

create or replace function public.update_vehicle_trip_status(p_trip_id uuid,p_status text,p_odometer numeric default null)
returns void language plpgsql security definer set search_path=public as $$ declare trip public.vehicle_trips%rowtype;actor uuid:=auth.uid();begin
  if actor is null or not public.can_administer() then raise exception 'Solo Administración puede ejecutar viajes.'; end if;
  if p_status not in('IN_PROGRESS','ARRIVED','COMPLETED','CANCELLED') then raise exception 'Estado de viaje inválido.'; end if;
  select * into trip from public.vehicle_trips where id=p_trip_id and deleted_at is null for update;if not found then raise exception 'Viaje no encontrado.';end if;
  update public.vehicle_trips set status=p_status,started_at=case when p_status='IN_PROGRESS' then coalesce(started_at,now())else started_at end,arrived_at=case when p_status='ARRIVED' then coalesce(arrived_at,now())else arrived_at end,completed_at=case when p_status='COMPLETED' then coalesce(completed_at,now())else completed_at end,odometer_start=case when p_status='IN_PROGRESS' and p_odometer is not null then p_odometer else odometer_start end,odometer_end=case when p_status='COMPLETED' and p_odometer is not null then p_odometer else odometer_end end,distance=case when p_status='COMPLETED' and p_odometer is not null and odometer_start is not null then p_odometer-odometer_start else distance end,deleted_at=case when p_status='CANCELLED'then now()else deleted_at end,updated_by=actor where id=p_trip_id;
  perform public.refresh_event_logistics(trip.project_id,actor);perform public.refresh_event_operational_readiness(trip.project_id,actor);
end $$;

create or replace view public.event_logistics_summary with (security_invoker=true) as
with trips as(select project_id,count(*)trip_count,count(distinct asset_id)vehicle_count from public.vehicle_trips where deleted_at is null and status<>'CANCELLED' group by project_id),
route_cost as(select project_id,sum(allocated_fuel_cost)fuel from public.vehicle_route_events group by project_id),
expense_cost as(select project_id,sum(case when category='FUEL'then total else 0 end)fuel,sum(case when category='TOLLS'then total else 0 end)tolls,sum(case when category='PARKING'then total else 0 end)parking,sum(case when category in('TRANSPORT','OTHER_OPERATIONAL')then total else 0 end)other,sum(total)total from public.expenses where vehicle_trip_id is not null and deleted_at is null and status<>'CANCELLED' group by project_id)
select p.id project_id,c.logistics_mode,c.logistics_status,coalesce(t.trip_count,0)trip_count,coalesce(t.vehicle_count,0)vehicle_count,
  coalesce(e.fuel,0)+coalesce(r.fuel,0)fuel_cost,coalesce(e.tolls,0)toll_cost,coalesce(e.parking,0)parking_cost,coalesce(e.other,0)other_cost,coalesce(e.total,0)+coalesce(r.fuel,0)real_logistics_cost
from public.projects p join public.project_operational_contracts c on c.project_id=p.id left join trips t on t.project_id=p.id left join route_cost r on r.project_id=p.id left join expense_cost e on e.project_id=p.id;

-- Logistics augments the certified readiness engine without duplicating its existing checks.
create or replace function public.phase_e_logistics_readiness_reason(p_project_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select case
    when c.logistics_mode='NOT_REQUIRED' then '[]'::jsonb
    when c.logistics_mode='COMPANY_VEHICLE' and not exists(select 1 from public.vehicle_trips t where t.project_id=c.project_id and t.asset_id is not null and t.deleted_at is null and t.status<>'CANCELLED') then jsonb_build_array(jsonb_build_object('code','LOGISTICS:VEHICLE','label','Falta vehículo para logística.','href','#event-logistics'))
    when not exists(select 1 from public.vehicle_trips t where t.project_id=c.project_id and (t.driver_staff_id is not null or t.driver_profile_id is not null or nullif(trim(coalesce(t.driver_name,'')),'') is not null) and t.deleted_at is null and t.status<>'CANCELLED') then jsonb_build_array(jsonb_build_object('code','LOGISTICS:DRIVER','label','Falta conductor para logística.','href','#event-logistics'))
    when not exists(select 1 from public.vehicle_trips t where t.project_id=c.project_id and t.deleted_at is null and t.status<>'CANCELLED') then jsonb_build_array(jsonb_build_object('code','LOGISTICS:TRIP','label','Falta viaje crítico de logística.','href','#event-logistics'))
    else '[]'::jsonb end from public.project_operational_contracts c where c.project_id=p_project_id;
$$;

revoke all on function public.save_event_logistics_trip(uuid,uuid,uuid,uuid,text,text,integer,text,text,timestamptz,timestamptz,text,text) from public,anon;
revoke all on function public.set_event_logistics_mode(uuid,text) from public,anon;
revoke all on function public.update_vehicle_trip_status(uuid,text,numeric) from public,anon;
grant execute on function public.save_event_logistics_trip(uuid,uuid,uuid,uuid,text,text,integer,text,text,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function public.set_event_logistics_mode(uuid,text) to authenticated;
grant execute on function public.update_vehicle_trip_status(uuid,text,numeric) to authenticated;
grant select on public.event_logistics_summary to authenticated;

commit;
