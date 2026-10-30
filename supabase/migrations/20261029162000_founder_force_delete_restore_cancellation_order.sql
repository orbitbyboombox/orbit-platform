begin;

do $patch$
declare
  ddl text;
  marker constant text := '-- Staff cancellations were removed before assignments.';
begin
  select pg_get_functiondef(
    'public.purge_event_controlled(uuid,text,text,boolean)'::regprocedure
  ) into ddl;

  if position(marker in ddl)=0 then
    raise exception 'Canonical purge function is missing the staff cancellation ordering marker';
  end if;

  ddl := replace(ddl, marker,
    'delete from public.staff_assignment_cancellations where project_id=p_project_id;');
  execute ddl;
end $patch$;

comment on function public.purge_event_controlled(uuid,text,text,boolean) is
  'Canonical CEO purge removes staff cancellations before settlement projections and assignments, preserving paid and finalized financial history.';

commit;
