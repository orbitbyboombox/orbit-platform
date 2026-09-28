begin;

create or replace function public.save_logistics_route_plan(
  p_route_id uuid,
  p_asset_id uuid,
  p_route_date date,
  p_driver_staff_id uuid,
  p_route_type text,
  p_project_ids uuid[]
) returns uuid language plpgsql security invoker set search_path=public as $$
declare
  actor uuid:=auth.uid();
  saved_id uuid;
  requested_count integer;
  existing_count integer;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Administración puede gestionar rutas.'; end if;
  if p_route_date is null or coalesce(array_length(p_project_ids,1),0)=0 then raise exception 'La ruta requiere fecha y eventos.'; end if;
  if p_route_type not in ('ASSEMBLY','DISASSEMBLY','FULL_DAY') then raise exception 'Tipo de ruta inválido.'; end if;
  requested_count:=array_length(p_project_ids,1);
  if requested_count>5 then raise exception 'Una ruta no puede superar 5 tótems/equipos.'; end if;

  select count(*) into existing_count
  from public.projects project
  where project.id=any(p_project_ids) and project.deleted_at is null;
  if existing_count<>requested_count or exists(
    select project_id from unnest(p_project_ids) project_id group by project_id having count(*)>1
  ) then
    raise exception 'Uno o más project_id no corresponden a Eventos válidos.' using errcode='23503';
  end if;

  if p_route_id is null then
    select id into saved_id
    from public.vehicle_routes
    where route_date=p_route_date and route_type=p_route_type
      and publication_status='DRAFT' and deleted_at is null
    order by updated_at desc nulls last,created_at desc
    limit 1 for update;
  else
    saved_id:=p_route_id;
  end if;

  if saved_id is null then
    insert into public.vehicle_routes(asset_id,route_date,driver_staff_id,route_type,publication_status,created_by,updated_by)
    values(p_asset_id,p_route_date,p_driver_staff_id,p_route_type,'DRAFT',actor,actor)
    returning id into saved_id;
  else
    update public.vehicle_routes
    set asset_id=p_asset_id,route_date=p_route_date,driver_staff_id=p_driver_staff_id,route_type=p_route_type,
        publication_status=case when publication_status='PUBLISHED' then 'MODIFIED' else publication_status end,
        updated_by=actor,updated_at=now()
    where id=saved_id and deleted_at is null;
    if not found then raise exception 'Ruta no encontrada.'; end if;
  end if;

  delete from public.vehicle_route_events where route_id=saved_id;
  insert into public.vehicle_route_events(route_id,project_id,sequence,created_by)
  select saved_id,project_id,row_number() over (),actor from unnest(p_project_ids) project_id;
  return saved_id;
end $$;

revoke all on function public.save_logistics_route_plan(uuid,uuid,date,uuid,text,uuid[]) from public,anon;
grant execute on function public.save_logistics_route_plan(uuid,uuid,date,uuid,text,uuid[]) to authenticated;
commit;
