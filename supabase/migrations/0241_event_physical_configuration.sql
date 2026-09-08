begin;

-- Physical configuration requirements use the existing requirements table.
-- Extend its source discriminator once, without changing existing rows.
alter table public.event_operational_requirements
  drop constraint if exists event_operational_requirements_source_type_check;
alter table public.event_operational_requirements
  add constraint event_operational_requirements_source_type_check
  check(source_type in('PROJECT_SERVICE','QUOTATION_ITEM','TRANSPORT','PHYSICAL_CONFIGURATION'));

create or replace function public.set_event_physical_configuration(
  p_project_id uuid,
  p_configuration text,
  p_actor_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=coalesce(auth.uid(),p_actor_id);
  normalized text:=upper(trim(coalesce(p_configuration,'UNDEFINED')));
  project_row public.projects%rowtype;
  service_exists boolean;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede cambiar la configuración física.'; end if;
  if normalized not in ('WHITE_TOTEM','BLACK_TOTEM','BBOX360_PLATFORM','IA43_INTEGRATED','UNDEFINED') then raise exception 'Configuración física no válida.'; end if;
  select * into project_row from public.projects where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  select exists(select 1 from public.project_services where project_id=p_project_id and upper(service_code) in ('CLASSIC','POLAROID','BLACK_STUDIO','INSTABOX')) into service_exists;
  if normalized in ('WHITE_TOTEM','BLACK_TOTEM') and not service_exists then raise exception 'La configuración de tótem requiere un servicio compatible con Caja Negra.'; end if;
  if normalized='BBOX360_PLATFORM' and not exists(select 1 from public.project_services where project_id=p_project_id and upper(service_code)='BBOX360') then raise exception 'La configuración BBOX360 requiere el servicio BBOX360.'; end if;

  update public.projects set operations=coalesce(operations,'{}'::jsonb)||jsonb_build_object('physicalConfiguration',normalized,'physicalConfigurationUpdatedAt',now(),'physicalConfigurationUpdatedBy',actor),updated_by=actor,updated_at=now() where id=p_project_id;
  perform public.sync_event_operational_requirements(p_project_id,actor);
  update public.event_operational_requirements set status='RETIRED',updated_by=actor,updated_at=now()
   where project_id=p_project_id and status='ACTIVE' and canonical_key like 'configuration:%';

  if normalized='WHITE_TOTEM' then
    insert into public.event_operational_requirements(project_id,canonical_key,source_type,source_id,code,label,requirement_type,asset_type,required_quantity,critical_for_readiness,status,metadata,created_by,updated_by)
    values (p_project_id,'configuration:WHITE_TOTEM:TOTEM','PHYSICAL_CONFIGURATION',p_project_id,'WHITE_TOTEM','Tótem blanco','PHYSICAL_UNIT','TOTEM',1,true,'ACTIVE',jsonb_build_object('configuration',normalized),actor,actor),
           (p_project_id,'configuration:WHITE_TOTEM:DISPLAY_22','PHYSICAL_CONFIGURATION',p_project_id,'DISPLAY_22','Display lateral 22"','PHYSICAL_UNIT','DISPLAY_22',1,true,'ACTIVE',jsonb_build_object('configuration',normalized),actor,actor)
    on conflict(project_id,canonical_key) do update set status='ACTIVE',required_quantity=excluded.required_quantity,updated_by=excluded.updated_by,updated_at=now();
  elsif normalized='BLACK_TOTEM' then
    insert into public.event_operational_requirements(project_id,canonical_key,source_type,source_id,code,label,requirement_type,asset_type,required_quantity,critical_for_readiness,status,metadata,created_by,updated_by)
    values (p_project_id,'configuration:BLACK_TOTEM:TOTEM','PHYSICAL_CONFIGURATION',p_project_id,'BLACK_TOTEM','Tótem negro','PHYSICAL_UNIT','TOTEM',1,true,'ACTIVE',jsonb_build_object('configuration',normalized),actor,actor)
    on conflict(project_id,canonical_key) do update set status='ACTIVE',required_quantity=excluded.required_quantity,updated_by=excluded.updated_by,updated_at=now();
  elsif normalized='BBOX360_PLATFORM' then
    insert into public.event_operational_requirements(project_id,canonical_key,source_type,source_id,code,label,requirement_type,asset_type,required_quantity,critical_for_readiness,status,metadata,created_by,updated_by)
    values (p_project_id,'configuration:BBOX360_PLATFORM:BBOX360','PHYSICAL_CONFIGURATION',p_project_id,'BBOX360','Plataforma 360','PHYSICAL_UNIT','BBOX360',1,true,'ACTIVE',jsonb_build_object('configuration',normalized),actor,actor)
    on conflict(project_id,canonical_key) do update set status='ACTIVE',required_quantity=excluded.required_quantity,updated_by=excluded.updated_by,updated_at=now();
  end if;
  return jsonb_build_object('projectId',p_project_id,'configuration',normalized);
end;
$$;

revoke all on function public.set_event_physical_configuration(uuid,text,uuid) from public,anon;
grant execute on function public.set_event_physical_configuration(uuid,text,uuid) to authenticated,service_role;

commit;
