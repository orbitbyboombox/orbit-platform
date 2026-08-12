begin;

create or replace function public.claim_staff_responsibility(
  p_staff_id uuid,
  p_project_id uuid,
  p_responsibility text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  existing public.assignments%rowtype;
  assignment_id uuid;
  orbit_id text;
  project_name text;
begin
  if p_responsibility not in ('OPERATOR','ASSEMBLY','DISASSEMBLY') then
    raise exception 'Responsabilidad operacional inválida.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':'||p_responsibility,0));
  if not exists (
    select 1 from public.staff
    where id=p_staff_id and status='ACTIVE' and deleted_at is null
      and p_responsibility=any(capabilities)
  ) then raise exception 'No estás disponible o esta responsabilidad no está habilitada en tu perfil.'; end if;
  select orbit_event_id,name into orbit_id,project_name from public.projects
    where id=p_project_id and deleted_at is null and event_date>=current_date
      and status not in ('Archived','Cancelled','CANCELLED');
  if orbit_id is null then raise exception 'El evento ya no está disponible.'; end if;
  select * into existing from public.assignments
    where project_id=p_project_id and assignment_type=p_responsibility
      and deleted_at is null and status not in ('CANCELLED','REJECTED') limit 1;
  if existing.id is not null then
    if existing.staff_id=p_staff_id then return existing.id; end if;
    raise exception 'Esta responsabilidad acaba de ser tomada por otro colaborador.';
  end if;
  insert into public.assignments(project_id,staff_id,assignment_type,status,resources,reason)
  values(p_project_id,p_staff_id,p_responsibility,'ACCEPTED',jsonb_build_object('eventName',project_name),'Tomada desde Portal Staff')
  returning id into assignment_id;
  insert into public.timeline_events(project_id,staff_id,event_type,title,description,orbit_event_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id)
  values(p_project_id,p_staff_id,'STAFF_ASSIGNED','Responsabilidad tomada.','Asignación confirmada desde Portal Staff.',orbit_id,'Staff','StaffPortal','STAFF_ASSIGNED','Assignment',assignment_id,'Colaborador tomó '||p_responsibility||' desde Portal Staff.',gen_random_uuid()::text);
  return assignment_id;
exception when unique_violation then
  raise exception 'Esta responsabilidad acaba de ser tomada por otro colaborador.';
end $$;

revoke all on function public.claim_staff_responsibility(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_staff_responsibility(uuid,uuid,text) to service_role;

-- Only the three BOOMBOX operational responsibilities remain assignable.
update public.staff set capabilities=array(
  select distinct value from unnest(capabilities) value
  where value in ('OPERATOR','ASSEMBLY','DISASSEMBLY')
) where capabilities && array['DRIVER','PHOTOGRAPHER','COORDINATOR','TECHNICIAN']::text[];
alter table public.staff drop constraint if exists staff_capabilities_check;
alter table public.staff add constraint staff_capabilities_check check (
  capabilities <@ array['OPERATOR','ASSEMBLY','DISASSEMBLY']::text[]
);

commit;
