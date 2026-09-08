begin;

-- Manual reservations may reach the capacity gate before an operational
-- contract exists. Selecting WHITE/BLACK is itself the Founder preparation
-- step; create only that canonical contract row, never a reservation/event.
create or replace function public.set_event_shell_configuration(p_project_id uuid,p_shell_type text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); normalized text:=nullif(upper(trim(p_shell_type)), '');
begin
  if actor is null or public.current_orbit_role() not in ('CEO','ADMINISTRATOR','OPERATIONS') then raise exception 'Permiso operacional requerido.'; end if;
  if normalized is not null and normalized not in ('WHITE','BLACK') then raise exception 'Carcasa inválida.'; end if;
  if not exists(select 1 from public.projects where id=p_project_id and deleted_at is null) then raise exception 'Evento no encontrado.'; end if;
  insert into public.project_operational_contracts(project_id,shell_type,shell_selection_source,prepared_by,updated_by)
  values(p_project_id,normalized,case when normalized is null then null else 'FOUNDER' end,actor,actor)
  on conflict(project_id) do update set shell_type=excluded.shell_type,shell_selection_source=excluded.shell_selection_source,updated_by=actor;
  return jsonb_build_object('projectId',p_project_id,'shellType',normalized);
end $$;

revoke all on function public.set_event_shell_configuration(uuid,text) from public,anon;
grant execute on function public.set_event_shell_configuration(uuid,text) to authenticated,service_role;
commit;
