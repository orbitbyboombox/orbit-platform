begin;

-- Staff executes only trips explicitly assigned to that collaborator. The RPC is
-- called through the authenticated Portal service boundary with the canonical Staff id.
create or replace function public.update_staff_vehicle_trip_status(
  p_staff_id uuid,p_trip_id uuid,p_status text,p_odometer numeric default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare trip public.vehicle_trips%rowtype;
begin
  if p_status not in('IN_PROGRESS','ARRIVED','COMPLETED') then raise exception 'Estado de viaje inválido.'; end if;
  select * into trip from public.vehicle_trips
   where id=p_trip_id and driver_staff_id=p_staff_id and deleted_at is null and status<>'CANCELLED' for update;
  if not found then raise exception 'Viaje no disponible para este conductor.'; end if;
  if not exists(select 1 from public.assignments where project_id=trip.project_id and staff_id=p_staff_id
    and status in('CONFIRMED','ACCEPTED','COMPLETED') and deleted_at is null) then
    raise exception 'No existe una asignación operacional confirmada.';
  end if;
  if (trip.status,p_status) not in (('PLANNED','IN_PROGRESS'),('IN_PROGRESS','ARRIVED'),('ARRIVED','COMPLETED')) then
    raise exception 'Transición de viaje inválida.';
  end if;
  update public.vehicle_trips set status=p_status,
    started_at=case when p_status='IN_PROGRESS' then coalesce(started_at,now()) else started_at end,
    arrived_at=case when p_status='ARRIVED' then coalesce(arrived_at,now()) else arrived_at end,
    completed_at=case when p_status='COMPLETED' then coalesce(completed_at,now()) else completed_at end,
    odometer_start=case when p_status='IN_PROGRESS' and p_odometer is not null then p_odometer else odometer_start end,
    odometer_end=case when p_status='COMPLETED' and p_odometer is not null then p_odometer else odometer_end end,
    distance=case when p_status='COMPLETED' and p_odometer is not null and odometer_start is not null then p_odometer-odometer_start else distance end,
    updated_at=now() where id=trip.id;
  perform public.refresh_event_logistics(trip.project_id,null);
  perform public.refresh_event_operational_readiness(trip.project_id,null);
  return trip.project_id;
end $$;

-- A cancelled trip remains an auditable row; status, not soft deletion, releases the exclusion window.
create or replace function public.update_vehicle_trip_status(p_trip_id uuid,p_status text,p_odometer numeric default null)
returns void language plpgsql security definer set search_path=public as $$
declare trip public.vehicle_trips%rowtype;actor uuid:=auth.uid();
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Administración puede ejecutar viajes.'; end if;
  if p_status not in('IN_PROGRESS','ARRIVED','COMPLETED','CANCELLED') then raise exception 'Estado de viaje inválido.'; end if;
  select * into trip from public.vehicle_trips where id=p_trip_id and deleted_at is null for update;
  if not found then raise exception 'Viaje no encontrado.';end if;
  update public.vehicle_trips set status=p_status,
    started_at=case when p_status='IN_PROGRESS' then coalesce(started_at,now()) else started_at end,
    arrived_at=case when p_status='ARRIVED' then coalesce(arrived_at,now()) else arrived_at end,
    completed_at=case when p_status='COMPLETED' then coalesce(completed_at,now()) else completed_at end,
    odometer_start=case when p_status='IN_PROGRESS' and p_odometer is not null then p_odometer else odometer_start end,
    odometer_end=case when p_status='COMPLETED' and p_odometer is not null then p_odometer else odometer_end end,
    distance=case when p_status='COMPLETED' and p_odometer is not null and odometer_start is not null then p_odometer-odometer_start else distance end,
    updated_by=actor where id=p_trip_id;
  perform public.refresh_event_logistics(trip.project_id,actor);
  perform public.refresh_event_operational_readiness(trip.project_id,actor);
end $$;

create or replace function public.event_logistics_project_changed() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in('CANCELLED','Cancelled') and old.status is distinct from new.status then
    update public.vehicle_trips set status='CANCELLED',updated_by=new.updated_by
      where project_id=new.id and deleted_at is null and status in('PLANNED','IN_PROGRESS','ARRIVED');
    update public.event_vehicle_assignments set status='CANCELLED',updated_by=new.updated_by
      where project_id=new.id and deleted_at is null and status='ASSIGNED';
  elsif (old.event_date,old.event_time,old.location,old.city,old.operations->>'eventAddress') is distinct from
        (new.event_date,new.event_time,new.location,new.city,new.operations->>'eventAddress')
    and exists(select 1 from public.vehicle_trips where project_id=new.id and deleted_at is null and status='PLANNED') then
    update public.project_operational_contracts set logistics_status='PENDING',logistics_closed_at=null,
      logistics_closed_by=null,logistics_close_reason=null,updated_by=new.updated_by where project_id=new.id;
  end if;
  return new;
end $$;

-- A future Event cannot remain "ready" when its assigned vehicle becomes unavailable.
create or replace function public.vehicle_health_logistics_alert() returns trigger language plpgsql security definer set search_path=public as $$
declare item record;
begin
  if new.status in('MAINTENANCE','OUT_OF_SERVICE') and old.status is distinct from new.status then
    for item in select distinct t.project_id,p.customer_id,p.name
      from public.vehicle_trips t join public.projects p on p.id=t.project_id
      where t.asset_id=new.id and t.deleted_at is null and t.status in('PLANNED','IN_PROGRESS','ARRIVED')
        and t.planned_end_at>now() loop
      update public.project_operational_contracts set logistics_status='PENDING',logistics_closed_at=null,
        logistics_closed_by=null,logistics_close_reason=null,updated_by=new.updated_by where project_id=item.project_id;
      insert into public.internal_notifications(project_id,customer_id,notification_type,title,message,status,
        correlation_id,category,priority,action_required,entity_type,entity_id,related_href,metadata)
      values(item.project_id,item.customer_id,'LOGISTICS_VEHICLE_UNAVAILABLE','Vehículo logístico no disponible',
        new.asset_code||' cambió a '||new.status||' y requiere corrección.','UNREAD',
        'logistics-vehicle-health:'||new.id||':'||item.project_id||':'||new.version,'OPERATIONS','HIGH',true,
        'OperationalAsset',new.id,'/projects/'||item.project_id||'#event-logistics',jsonb_build_object('assetCode',new.asset_code,'status',new.status))
      on conflict(correlation_id) do nothing;
      perform public.refresh_event_operational_readiness(item.project_id,new.updated_by);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists operational_asset_logistics_alert on public.operational_assets;
create trigger operational_asset_logistics_alert after update of status on public.operational_assets
  for each row execute function public.vehicle_health_logistics_alert();

-- Idempotent Founder alerts for upcoming Events with incomplete logistics.
create or replace function public.refresh_logistics_notifications(p_reference timestamptz default now())
returns integer language plpgsql security definer set search_path=public as $$
declare item record; inserted_count integer:=0; priority_value text; local_day date:=(p_reference at time zone 'America/Santiago')::date;
begin
  for item in select p.id,p.customer_id,p.name,p.event_date,c.readiness_reasons
    from public.projects p join public.project_operational_contracts c on c.project_id=p.id
    where p.deleted_at is null and p.status not in('CANCELLED','Cancelled','Archived','Completed')
      and c.logistics_mode<>'NOT_REQUIRED' and c.logistics_status in('PENDING','PLANNED')
      and p.event_date between local_day and local_day+3
      and jsonb_array_length(coalesce(public.phase_e_logistics_readiness_reason(p.id),'[]'::jsonb))>0 loop
    priority_value:=case when item.event_date=local_day then 'CRITICAL' else 'HIGH' end;
    insert into public.internal_notifications(project_id,customer_id,notification_type,title,message,status,correlation_id,
      category,priority,action_required,entity_type,entity_id,related_href,metadata)
    values(item.id,item.customer_id,'LOGISTICS_READINESS_ALERT',
      case when item.event_date=local_day then 'Logística crítica para hoy' else 'Logística pendiente antes del Evento' end,
      item.name||' · '||item.event_date||' requiere completar su plan logístico.','UNREAD',
      'logistics-readiness:'||item.id||':'||item.event_date,'OPERATIONS',priority_value,true,'Project',item.id,
      '/projects/'||item.id||'#event-logistics',jsonb_build_object('eventDate',item.event_date,'referenceDate',local_day))
    on conflict(correlation_id) do nothing;
    if found then inserted_count:=inserted_count+1; end if;
  end loop;
  return inserted_count;
end $$;

create or replace function public.close_event_logistics(p_project_id uuid,p_override_reason text default null)
returns void language plpgsql security invoker set search_path=public as $$
declare pending_trips integer; pending_expenses integer; active_trips integer; mode text;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Solo Administración puede cerrar logística.'; end if;
  select logistics_mode into mode from public.project_operational_contracts where project_id=p_project_id for update;
  select count(*),count(*) filter(where status not in('COMPLETED','CANCELLED')) into active_trips,pending_trips
    from public.vehicle_trips where project_id=p_project_id and deleted_at is null and status<>'CANCELLED';
  select count(*) into pending_expenses from public.expenses where project_id=p_project_id and vehicle_trip_id is not null and deleted_at is null and status='PENDING';
  if mode<>'NOT_REQUIRED' and active_trips=0 and nullif(trim(coalesce(p_override_reason,'')),'') is null then
    raise exception 'Cierre pendiente: no existe ningún viaje logístico ejecutado.';
  end if;
  if (pending_trips>0 or pending_expenses>0) and nullif(trim(coalesce(p_override_reason,'')),'') is null then
    raise exception 'Cierre pendiente: % viaje(s) y % gasto(s) requieren resolución.',pending_trips,pending_expenses;
  end if;
  update public.project_operational_contracts set logistics_closed_at=now(),logistics_closed_by=auth.uid(),
    logistics_close_reason=nullif(trim(p_override_reason),''),logistics_status='COMPLETED',updated_by=auth.uid() where project_id=p_project_id;
  perform public.refresh_event_operational_readiness(p_project_id,auth.uid());
end $$;

create or replace view public.event_logistics_summary with (security_invoker=true) as
with trips as(select project_id,count(*)trip_count,count(distinct asset_id)vehicle_count from public.vehicle_trips where deleted_at is null and status<>'CANCELLED' group by project_id),
route_cost as(select project_id,sum(allocated_fuel_cost)fuel from public.vehicle_route_events group by project_id),
expense_cost as(select project_id,sum(case when category='FUEL'then total else 0 end)fuel,sum(case when category='TOLLS'then total else 0 end)tolls,
  sum(case when category='PARKING'then total else 0 end)parking,sum(case when category in('TRANSPORT','OTHER_OPERATIONAL')then total else 0 end)other,
  sum(total)total from public.expenses where vehicle_trip_id is not null and deleted_at is null and status not in('CANCELLED','REJECTED') group by project_id)
select p.id project_id,c.logistics_mode,c.logistics_status,coalesce(t.trip_count,0)trip_count,coalesce(t.vehicle_count,0)vehicle_count,
  coalesce(e.fuel,0)+coalesce(r.fuel,0)fuel_cost,coalesce(e.tolls,0)toll_cost,coalesce(e.parking,0)parking_cost,coalesce(e.other,0)other_cost,
  coalesce(e.total,0)+coalesce(r.fuel,0)real_logistics_cost
from public.projects p join public.project_operational_contracts c on c.project_id=p.id left join trips t on t.project_id=p.id
left join route_cost r on r.project_id=p.id left join expense_cost e on e.project_id=p.id;

revoke all on function public.update_staff_vehicle_trip_status(uuid,uuid,text,numeric) from public,anon;
revoke all on function public.refresh_logistics_notifications(timestamptz) from public,anon;
grant execute on function public.update_staff_vehicle_trip_status(uuid,uuid,text,numeric) to service_role;
grant execute on function public.refresh_logistics_notifications(timestamptz) to authenticated,service_role;

commit;
