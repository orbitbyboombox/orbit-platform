begin;

create or replace function public.distribute_vehicle_route(p_route_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare total numeric(14,2);event_count integer;route_record public.vehicle_routes;route_label text;
begin
  select * into route_record from public.vehicle_routes where id=p_route_id and deleted_at is null;
  if not found then return; end if;
  select coalesce(total_amount,0) into total from public.vehicle_fuel_logs where id=route_record.fuel_log_id;
  select count(*) into event_count from public.vehicle_route_events where route_id=p_route_id;
  if event_count=0 then return; end if;
  with ordered as(select id,row_number() over(order by project_id) rn from public.vehicle_route_events where route_id=p_route_id)
  update public.vehicle_route_events vre set allocated_fuel_cost=case
    when ordered.rn=event_count then total-(round(total/event_count,2)*(event_count-1))
    else round(total/event_count,2) end
  from ordered where vre.id=ordered.id;
  route_label:='Ruta '||route_record.route_date::text;
  update public.event_vehicle_assignments eva set status='CANCELLED',deleted_at=now(),deleted_by=auth.uid(),updated_by=auth.uid()
  where eva.deleted_at is null and eva.status='ASSIGNED' and (
    eva.route_id=p_route_id or (
      eva.asset_id=route_record.asset_id and exists(
        select 1 from public.vehicle_route_events vre where vre.route_id=p_route_id and vre.project_id=eva.project_id
      )
    )
  );
  insert into public.event_vehicle_assignments(project_id,asset_id,driver_staff_id,route,fuel_cost,distance,status,route_id,allocated_fuel_cost,created_by,updated_by)
  select vre.project_id,route_record.asset_id,route_record.driver_staff_id,route_label,vre.allocated_fuel_cost,
    coalesce(route_record.distance,0),'ASSIGNED',p_route_id,vre.allocated_fuel_cost,auth.uid(),auth.uid()
  from public.vehicle_route_events vre where vre.route_id=p_route_id;
  perform public.refresh_route_financials();
end $$;

commit;
