begin;

do $outer$
declare
  ddl text;
  old_block constant text := $old$if found then
    return jsonb_build_object('status', existing_job.status, 'projectId', p_project_id, 'jobId', existing_job.id);
  end if;$old$;
  replacement constant text := $new$if found then
    return jsonb_build_object('status', 'ALREADY_DELETED', 'projectId', p_project_id, 'jobId', existing_job.id, 'cleanupStatus', existing_job.status);
  end if;$new$;
begin
  select pg_get_functiondef('public.purge_event_controlled(uuid,text,text,boolean)'::regprocedure) into ddl;
  if position(old_block in ddl) = 0 then
    raise exception 'Expected existing deletion job block was not found';
  end if;
  ddl := replace(ddl, old_block, replacement);
  execute ddl;
end $outer$;

commit;
