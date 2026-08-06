begin;

alter table public.staff
  add column if not exists specializations text[] not null default '{}';

update public.staff
set status = case
  when status in ('AVAILABLE', 'ASSIGNED') then 'ACTIVE'
  when status = 'UNAVAILABLE' then 'INACTIVE'
  else status
end;

update public.staff
set capabilities = case
  when operational_group = 'CALYPSO' then array['ASSEMBLY','OPERATOR','DISASSEMBLY']
  when operational_group = 'GREEN' then array['OPERATOR']
  else capabilities
end
where cardinality(capabilities) = 0;

alter table public.staff drop constraint if exists staff_status_check;
alter table public.staff add constraint staff_status_check
  check (status in ('ACTIVE','VACATION','MEDICAL_LEAVE','INACTIVE'));

alter table public.staff drop constraint if exists staff_capabilities_check;
alter table public.staff add constraint staff_capabilities_check
  check (capabilities <@ array['ASSEMBLY','OPERATOR','DISASSEMBLY']::text[]);

alter table public.staff drop constraint if exists staff_specializations_check;
alter table public.staff add constraint staff_specializations_check
  check (specializations <@ array['CLASSIC','POLAROID','BLACK_STUDIO','BBOX360','LIGHTBOX','BOOMBALL','HASHTAG','INSTABOX','VIDEO_LOUNGE']::text[]);

create or replace function public.apply_staff_capability_defaults()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.operational_group is distinct from old.operational_group and new.capabilities = old.capabilities then
    new.capabilities := case
      when new.operational_group='CALYPSO' then array['ASSEMBLY','OPERATOR','DISASSEMBLY']
      when new.operational_group='GREEN' then array['OPERATOR']
      else '{}'::text[]
    end;
  end if;
  return new;
end $$;

drop trigger if exists staff_capability_defaults on public.staff;
create trigger staff_capability_defaults before update on public.staff
for each row execute function public.apply_staff_capability_defaults();

create or replace function public.validate_assignment_staff_capability()
returns trigger language plpgsql set search_path=public as $$
declare member_status text; member_capabilities text[];
begin
  if new.assignment_type not in ('ASSEMBLY','OPERATOR','DISASSEMBLY') then return new; end if;
  select status, capabilities into member_status, member_capabilities
  from public.staff where id=new.staff_id and deleted_at is null;
  if member_status is null then raise exception 'Staff no disponible.'; end if;
  if member_status <> 'ACTIVE' then raise exception 'Staff no disponible para asignación.'; end if;
  if not (new.assignment_type = any(member_capabilities)) then raise exception 'Staff sin capacidad para esta tarea.'; end if;
  return new;
end $$;

drop trigger if exists assignments_validate_staff_capability on public.assignments;
create trigger assignments_validate_staff_capability before insert or update of staff_id,assignment_type
on public.assignments for each row execute function public.validate_assignment_staff_capability();

create or replace function public.validate_staff_capabilities()
returns trigger language plpgsql set search_path=public as $$
declare allowed text[]; member_status text;
begin
  select capabilities,status into allowed,member_status from public.staff where id=new.staff_id and deleted_at is null;
  if allowed is null or member_status <> 'ACTIVE' then raise exception 'Staff no disponible.'; end if;
  if new.assembly_payment > 0 and not ('ASSEMBLY'=any(allowed)) then raise exception 'Staff sin capacidad de montaje.'; end if;
  if new.operator_payment > 0 and not ('OPERATOR'=any(allowed)) then raise exception 'Staff sin capacidad de operación.'; end if;
  if new.disassembly_payment > 0 and not ('DISASSEMBLY'=any(allowed)) then raise exception 'Staff sin capacidad de desmontaje.'; end if;
  return new;
end $$;

create or replace function public.record_staff_model_timeline()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.timeline_events(event_type,title,description,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,staff_id,previous_state,new_state,human_message,correlation_id,created_by)
  select change.action_name,'Staff actualizado.',change.message,'ORB-STAFF-'||new.id,auth.uid(),'Administrador','Administrator',change.action_name,'Staff',new.id,new.id,to_jsonb(old),to_jsonb(new),change.message,gen_random_uuid()::text,auth.uid()
  from (values
    ('STAFF_CAPABILITIES_CHANGED','Las capacidades operacionales del colaborador fueron actualizadas.',new.capabilities is distinct from old.capabilities),
    ('STAFF_STATUS_CHANGED','El estado del colaborador fue actualizado.',new.status is distinct from old.status),
    ('STAFF_SPECIALIZATIONS_CHANGED','Las especializaciones del colaborador fueron actualizadas.',new.specializations is distinct from old.specializations)
  ) as change(action_name,message,changed)
  where change.changed;
  return new;
end $$;

drop trigger if exists staff_model_timeline on public.staff;
create trigger staff_model_timeline after update of capabilities,status,specializations on public.staff
for each row execute function public.record_staff_model_timeline();

create or replace function public.import_staff(p_rows jsonb)
returns integer language plpgsql security invoker set search_path=public as $$
declare item jsonb; actor uuid := auth.uid(); imported integer := 0; staff_id uuid; normalized_rut text; correlation text; imported_capabilities text[]; imported_specializations text[];
begin
  if actor is null or not public.can_administer() then raise exception 'No autorizado para importar Staff.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)=0 then raise exception 'La importación no contiene filas.'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) row group by upper(regexp_replace(row->>'rut','[^0-9K]','','g')) having count(*)>1) then raise exception 'El archivo contiene RUT duplicados.'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    normalized_rut := upper(regexp_replace(item->>'rut','[^0-9K]','','g'));
    if exists(select 1 from public.staff where upper(regexp_replace(rut,'[^0-9K]','','g'))=normalized_rut and deleted_at is null) then raise exception 'Ya existe Staff con RUT %.', normalized_rut; end if;
    if item->>'roleClassification' not in ('CALYPSO','GREEN') then raise exception 'Clasificación operacional inválida.'; end if;
    if item->>'status' not in ('ACTIVE','VACATION','MEDICAL_LEAVE','INACTIVE') then raise exception 'Estado de Staff inválido.'; end if;
    select coalesce(array_agg(value), '{}') into imported_capabilities from jsonb_array_elements_text(coalesce(item->'capabilities','[]'::jsonb));
    if cardinality(imported_capabilities)=0 then imported_capabilities := case when item->>'roleClassification'='CALYPSO' then array['ASSEMBLY','OPERATOR','DISASSEMBLY'] else array['OPERATOR'] end; end if;
    select coalesce(array_agg(value), '{}') into imported_specializations from jsonb_array_elements_text(coalesce(item->'specializations','[]'::jsonb));
    insert into public.staff(employee_code,first_name,last_name,rut,phone,email,status,role,operational_group,capabilities,specializations,observations,bank,account_number,emergency_contact,availability,created_by,updated_by)
    values(nullif(item->>'employeeCode',''),item->>'firstName',item->>'lastName',normalized_rut,item->>'phone',nullif(item->>'email',''),item->>'status','OPERATOR',item->>'roleClassification',imported_capabilities,imported_specializations,nullif(item->>'notes',''),nullif(item->>'bank',''),nullif(item->>'accountNumber',''),case when nullif(item->>'emergencyContact','') is null then '{}'::jsonb else jsonb_build_object('label',item->>'emergencyContact') end,'{}'::jsonb,actor,actor) returning id into staff_id;
    correlation := gen_random_uuid()::text;
    insert into public.timeline_events(event_type,title,description,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,staff_id,human_message,correlation_id,created_by)
    values('STAFF_IMPORTED','Staff incorporado.','El colaborador fue incorporado mediante importación oficial.','ORB-STAFF-'||staff_id,actor,'Administrador','Administrator','STAFF_IMPORTED','Staff',staff_id,staff_id,'Colaborador incorporado a Staff.',correlation,actor);
    imported := imported + 1;
  end loop;
  return imported;
end $$;

commit;
