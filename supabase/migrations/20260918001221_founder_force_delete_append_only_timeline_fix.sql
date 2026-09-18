begin;

do $outer$
declare
  ddl text;
  old_delete constant text := 'delete from public.communications where project_id=p_project_id;';
  replacement constant text := '-- Communications remain as append-only evidence because timeline_events references them.
  -- They are hidden from normal operation when the source Event is deleted.';
begin
  select pg_get_functiondef('public.purge_event_controlled(uuid,text,text,boolean)'::regprocedure) into ddl;
  if position(old_delete in ddl) = 0 then
    raise exception 'Expected communications delete clause was not found in purge_event_controlled';
  end if;
  ddl := replace(ddl, old_delete, replacement);
  execute ddl;
end $outer$;

commit;
