begin;

create or replace function public.get_event_staff_requirements(p_project_id uuid)
returns table(role text,required_quantity integer,published boolean)
language plpgsql security definer set search_path=public as $$
begin
  if not public.can_administer() then raise exception 'Solo Administración puede consultar la planificación Staff.'; end if;
  return query select requirement.role,requirement.required_quantity,requirement.published
    from public.event_staff_requirements requirement
    where requirement.project_id=p_project_id order by requirement.role;
end $$;
revoke all on function public.get_event_staff_requirements(uuid) from public,anon;
grant execute on function public.get_event_staff_requirements(uuid) to authenticated,service_role;

commit;
