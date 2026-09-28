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
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Administración puede gestionar rutas.'; end if;
  if p_route_date is null or coalesce(array_length(p_project_ids,1),0)=0 then raise exception 'La ruta requiere fecha y eventos.'; end if;
  if p_route_type not in ('ASSEMBLY','DISASSEMBLY','FULL_DAY') then raise exception 'Tipo de ruta inválido.'; end if;
  if array_length(p_project_ids,1)>5 then raise exception 'Una ruta no puede superar 5 tótems/equipos.'; end if;

  if p_route_id is null then
    select id into saved_id
    from public.vehicle_routes
    where route_date=p_route_date
      and route_type=p_route_type
      and publication_status='DRAFT'
      and deleted_at is null
    order by updated_at desc nulls last, created_at desc
    limit 1
    for update;
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

create or replace function public.resolve_staff_operator_incident(p_incident_id uuid,p_resolution text)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede resolver incidencias.'; end if;
  if length(trim(coalesce(p_resolution,'')))<3 then raise exception 'Resolución obligatoria.'; end if;
  if not exists(select 1 from public.event_incidents where id=p_incident_id) then raise exception 'Incidencia no encontrada.'; end if;
  update public.event_incidents
  set status='RESOLVED',resolution=trim(p_resolution),resolved_at=now(),resolved_by=actor,updated_at=now()
  where id=p_incident_id;
  update public.internal_notifications
  set status='RESOLVED',action_required=false,read_at=coalesce(read_at,now()),updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('resolved_at',now(),'resolved_by',actor,'resolution',trim(p_resolution))
  where notification_type='STAFF_OPERATOR_INCIDENT' and entity_type='EventIncident' and entity_id=p_incident_id::text;
end $$;

revoke all on function public.resolve_staff_operator_incident(uuid,text) from public,anon;
grant execute on function public.resolve_staff_operator_incident(uuid,text) to authenticated;
commit;
