begin;

-- tasks.timeline_reference points to immutable timeline evidence with ON DELETE
-- CASCADE. Retain the task as an inactive tombstone instead of cascading into
-- timeline_events during normal Founder Force Delete.
do $patch$
declare
  ddl text;
  expected text := 'delete from public.tasks where project_id=p_project_id;';
begin
  select pg_get_functiondef('public.purge_event_controlled(uuid,text,text,boolean)'::regprocedure) into ddl;
  if position(expected in ddl) = 0 then
    raise exception 'Canonical purge function does not contain the expected task delete';
  end if;
  ddl := replace(ddl, expected,
    $$update public.tasks
      set project_id=null,
          orbit_event_id=null,
          status='COMPLETED',
          deleted_at=now(),
          updated_at=now(),
          metadata=metadata || jsonb_build_object('sourceEventDeleted', true, 'deletionReason', 'SOURCE_EVENT_DELETED')
      where project_id=p_project_id;$$);
  execute ddl;
end $patch$;

comment on function public.purge_event_controlled(uuid,text,text,boolean) is
  'Founder force delete removes operational exposure transactionally while preserving timeline-linked tasks and append-only audit history as tombstones.';

commit;
