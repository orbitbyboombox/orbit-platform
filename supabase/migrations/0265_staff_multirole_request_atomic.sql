begin;

create or replace function public.request_staff_responsibilities(
  p_staff_id uuid,
  p_project_id uuid,
  p_responsibilities text[]
) returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  roles text[] := array(select distinct unnest(p_responsibilities));
  role_name text;
  result uuid[] := '{}';
  required_count integer;
  assigned_count integer;
  existing_id uuid;
begin
  if roles is null or cardinality(roles) = 0 then
    raise exception 'Selecciona al menos una responsabilidad.';
  end if;
  if exists (select 1 from unnest(roles) r where r not in ('OPERATOR','ASSEMBLY','DISASSEMBLY')) then
    raise exception 'Responsabilidad inválida.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text || ':staff-request', 0));
  if not exists (select 1 from public.staff_event_publications where project_id=p_project_id and published) then
    raise exception 'Este evento ya no está disponible.';
  end if;
  if not exists (select 1 from public.staff where id=p_staff_id and status='ACTIVE' and deleted_at is null) then
    raise exception 'Staff no disponible.';
  end if;
  foreach role_name in array roles loop
    if not exists (select 1 from public.staff where id=p_staff_id and capabilities @> array[role_name]) then
      raise exception 'No tienes habilitada esta responsabilidad: %.', role_name;
    end if;
    select required_quantity into required_count from public.event_staff_requirements where project_id=p_project_id and role=role_name and published;
    if coalesce(required_count,0)=0 then raise exception 'La responsabilidad % no está publicada.', role_name; end if;
    select count(*) into assigned_count from public.assignments where project_id=p_project_id and assignment_type=role_name and deleted_at is null and status not in ('CANCELLED','REJECTED');
    if assigned_count >= required_count and not exists (select 1 from public.assignments where project_id=p_project_id and staff_id=p_staff_id and assignment_type=role_name and deleted_at is null and status not in ('CANCELLED','REJECTED')) then
      raise exception 'El cupo de % ya está completo.', role_name;
    end if;
  end loop;
  foreach role_name in array roles loop
    select id into existing_id from public.staff_assignment_requests where project_id=p_project_id and staff_id=p_staff_id and responsibility=role_name and status='PENDING';
    if existing_id is null then
      insert into public.staff_assignment_requests(project_id,staff_id,responsibility) values(p_project_id,p_staff_id,role_name) returning id into existing_id;
    end if;
    result := result || existing_id;
  end loop;
  return result;
end;
$$;

revoke all on function public.request_staff_responsibilities(uuid,uuid,text[]) from public, anon, authenticated;
grant execute on function public.request_staff_responsibilities(uuid,uuid,text[]) to service_role;

commit;
