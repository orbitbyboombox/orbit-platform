begin;

-- Communications referenced by timeline_events are historical parents. A
-- physical delete would cascade into timeline_events and violate its
-- append-only trigger. Detach those rows, then remove only non-historical
-- operational communications for the deleted event.
do $patch$
declare
  ddl text;
  unsafe_delete constant text := 'delete from public.communications where project_id=p_project_id;';
  safe_delete constant text := $$update public.communications
    set project_id=null
    where project_id=p_project_id
      and exists (
        select 1
        from public.timeline_events
        where communication_id=public.communications.id
      );
  delete from public.communications where project_id=p_project_id;$$;
begin
  select pg_get_functiondef(
    'public.purge_event_controlled(uuid,text,text,boolean)'::regprocedure
  ) into ddl;

  if position(unsafe_delete in ddl) = 0 then
    raise exception 'Canonical purge function does not contain the expected communications delete clause';
  end if;

  execute replace(ddl, unsafe_delete, safe_delete);
end $patch$;

comment on function public.purge_event_controlled(uuid,text,text,boolean) is
  'Canonical CEO purge preserves timeline-linked communications as detached historical evidence and removes only non-historical operational communications.';

commit;
