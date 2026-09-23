begin;

-- timeline_events is immutable evidence. QA purge removes operational exposure
-- but preserves its append-only audit graph and any parents referenced by it.
do $patch$
declare
  ddl text;
  expected text := 'delete from public.timeline_events where project_id=p_project_id;';
begin
  select pg_get_functiondef('public.purge_event_test_full(uuid,text,text)'::regprocedure) into ddl;
  if position(expected in ddl) = 0 then
    raise exception 'QA purge function is not the expected pre-fix version';
  end if;

  ddl := replace(ddl,
    'delete from public.calendar_sync where project_id=p_project_id;',
    $$-- calendar_sync is retained as an append-only-linked tombstone.$$);
  ddl := replace(ddl,
    'delete from public.crm_events where project_id=p_project_id;',
    $$update public.crm_events
      set status='DELETED', updated_at=now()
      where project_id=p_project_id;$$);
  ddl := replace(ddl,
    'delete from public.timeline_events where project_id=p_project_id;',
    $$-- timeline_events is intentionally preserved; its append-only guard remains active.$$);
  ddl := replace(ddl,
    'delete from public.projects where id=p_project_id;',
    $$update public.projects
      set status='DELETED', pipeline_stage='ARCHIVADO', health='BLOCKED',
          deleted_at=now(), deleted_by=actor, approval_reason=trim(p_reason),
          updated_at=now()
      where id=p_project_id;$$);
  execute ddl;
end $patch$;

comment on function public.purge_event_test_full(uuid,text,text) is
  'Founder-only QA operational purge. Preserves timeline_events and linked parents as append-only audit evidence; never disables the global mutation guard.';

commit;
