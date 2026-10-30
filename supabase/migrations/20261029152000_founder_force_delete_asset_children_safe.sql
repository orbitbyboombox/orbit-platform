begin;

-- Paper closeouts and assignment inspections are event-exclusive operational
-- children. Remove them before asset_assignments so their foreign keys cannot
-- block the controlled event purge. This does not touch inventory masters or
-- snapshots belonging to another project.
do $patch$
declare
  ddl text;
  unsafe_delete constant text := 'delete from public.asset_assignments where project_id=p_project_id;';
  safe_delete constant text := $$delete from public.event_paper_reloads
    where project_id=p_project_id;
  delete from public.event_paper_snapshots
    where project_id=p_project_id;
  delete from public.asset_assignment_inspections
    where asset_assignment_id in (
      select id from public.asset_assignments where project_id=p_project_id
    );
  delete from public.event_incidents
    where project_id=p_project_id;
  delete from public.asset_assignments where project_id=p_project_id;$$;
begin
  select pg_get_functiondef(
    'public.purge_event_controlled(uuid,text,text,boolean)'::regprocedure
  ) into ddl;

  if position(unsafe_delete in ddl) = 0 then
    raise exception 'Canonical purge function does not contain the expected asset assignment delete clause';
  end if;

  execute replace(ddl, unsafe_delete, safe_delete);
end $patch$;

comment on function public.purge_event_controlled(uuid,text,text,boolean) is
  'Canonical CEO purge removes event-exclusive paper, inspection and incident children before asset assignments, preserving inventory masters and unrelated events.';

commit;
