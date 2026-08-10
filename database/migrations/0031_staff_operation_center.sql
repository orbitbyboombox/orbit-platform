begin;

alter table public.staff add column if not exists account_type text;
alter table public.staff drop constraint if exists staff_status_check;
alter table public.staff add constraint staff_status_check check(status in('ACTIVE','VACATION','MEDICAL_LEAVE','INACTIVE','DISABLED'));

create or replace function public.assign_staff_group(p_staff_ids uuid[],p_project_id uuid,p_assignment_type text,p_vehicle text,p_reason text)
returns uuid[] language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid();member_id uuid;assignment_id uuid;assignment_ids uuid[]:='{}';orbit_id text;project_name text;
begin
  if actor is null or not public.can_administer()then raise exception 'Solo Administración puede asignar Staff.';end if;
  if p_project_id is null or coalesce(array_length(p_staff_ids,1),0)=0 or nullif(p_assignment_type,'')is null then raise exception 'Selecciona evento, Staff y rol.';end if;
  select orbit_event_id,name into orbit_id,project_name from public.projects where id=p_project_id and deleted_at is null;
  if orbit_id is null then raise exception 'Evento no encontrado.';end if;
  foreach member_id in array p_staff_ids loop
    if not exists(select 1 from public.staff where id=member_id and status='ACTIVE' and deleted_at is null)then raise exception 'Uno de los colaboradores no está disponible.';end if;
    insert into public.assignments(project_id,staff_id,assignment_type,status,resources,reason,created_by,updated_by)
    values(p_project_id,member_id,p_assignment_type,'PENDING',jsonb_build_object('vehicle',nullif(p_vehicle,''),'eventName',project_name),coalesce(nullif(p_reason,''),'Asignación operacional'),actor,actor)returning id into assignment_id;
    assignment_ids:=array_append(assignment_ids,assignment_id);
    insert into public.timeline_events(project_id,staff_id,event_type,title,description,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by)
    values(p_project_id,member_id,'STAFF_ASSIGNED','Staff asignado.','Colaborador asignado al evento.',orbit_id,actor,'Administrador','Administrator','STAFF_ASSIGNED','Assignment',assignment_id,'Colaborador asignado al evento.',gen_random_uuid()::text,actor);
  end loop;
  return assignment_ids;
end$$;

commit;
