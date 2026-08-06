begin;

alter table public.staff
  add column if not exists employee_code text,
  add column if not exists bank text,
  add column if not exists account_number text;

create unique index if not exists staff_employee_code_unique_idx on public.staff(employee_code) where employee_code is not null and deleted_at is null;

create or replace function public.import_staff(p_rows jsonb)
returns integer language plpgsql security invoker set search_path=public as $$
declare item jsonb; actor uuid := auth.uid(); imported integer := 0; staff_id uuid; normalized_rut text; correlation text;
begin
  if actor is null or not public.can_administer() then raise exception 'No autorizado para importar Staff.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)=0 then raise exception 'La importación no contiene filas.'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) row group by upper(regexp_replace(row->>'rut','[^0-9K]','','g')) having count(*)>1) then raise exception 'El archivo contiene RUT duplicados.'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    normalized_rut := upper(regexp_replace(item->>'rut','[^0-9K]','','g'));
    if exists(select 1 from public.staff where upper(regexp_replace(rut,'[^0-9K]','','g'))=normalized_rut and deleted_at is null) then raise exception 'Ya existe Staff con RUT %.', normalized_rut; end if;
    if item->>'roleClassification' not in ('CALYPSO','GREEN') then raise exception 'Clasificación operacional inválida.'; end if;
    if item->>'status' not in ('ACTIVE','INACTIVE') then raise exception 'Estado de Staff inválido.'; end if;
    insert into public.staff(employee_code,first_name,last_name,rut,phone,email,status,role,operational_group,capabilities,observations,bank,account_number,emergency_contact,availability,created_by,updated_by)
    values(nullif(item->>'employeeCode',''),item->>'firstName',item->>'lastName',normalized_rut,item->>'phone',nullif(item->>'email',''),item->>'status','OPERATOR',item->>'roleClassification',
      case when item->>'roleClassification'='CALYPSO' then array['ASSEMBLY','OPERATOR','DISASSEMBLY'] else array['OPERATOR'] end,
      nullif(item->>'notes',''),nullif(item->>'bank',''),nullif(item->>'accountNumber',''),
      case when nullif(item->>'emergencyContact','') is null then '{}'::jsonb else jsonb_build_object('label',item->>'emergencyContact') end,
      '{}'::jsonb,actor,actor) returning id into staff_id;
    correlation := gen_random_uuid()::text;
    insert into public.timeline_events(event_type,title,description,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,staff_id,human_message,correlation_id,created_by)
    values('STAFF_IMPORTED','Staff incorporado.','El colaborador fue incorporado mediante importación oficial.','ORB-STAFF-'||staff_id,actor,'Administrador','Administrator','STAFF_IMPORTED','Staff',staff_id,staff_id,'Colaborador incorporado a Staff. ',correlation,actor);
    imported := imported + 1;
  end loop;
  return imported;
end $$;

revoke all on function public.import_staff(jsonb) from public;
grant execute on function public.import_staff(jsonb) to authenticated;

commit;
