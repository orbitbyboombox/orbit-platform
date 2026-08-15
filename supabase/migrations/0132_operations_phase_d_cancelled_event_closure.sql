begin;

-- Close every Staff-facing surface after the canonical Event lifecycle has
-- committed CANCEL. This RPC owns only the operational projection closure and
-- deliberately does not create Timeline, notifications or email records.
create or replace function public.close_cancelled_event_staff_flow(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  event_record public.projects%rowtype;
begin
  if auth.uid() is null or not public.can_administer() then
    raise exception 'Solo Administración puede cerrar la publicación de Staff.';
  end if;

  select * into event_record
  from public.projects
  where id=p_project_id
  for update;

  if not found then raise exception 'Evento no encontrado.'; end if;
  if upper(coalesce(event_record.status,'')) not in ('CANCELLED','CANCELED','CLOSED','ARCHIVED')
     and event_record.deleted_at is null then
    raise exception 'El Evento debe estar cerrado antes de cerrar su publicación de Staff.';
  end if;

  update public.staff_event_publications
  set published=false,updated_at=now()
  where project_id=p_project_id;

  update public.event_staff_requirements
  set published=false,updated_at=now(),updated_by=auth.uid()
  where project_id=p_project_id;

  update public.staff_assignment_requests
  set status='CANCELLED',reviewed_at=now(),reviewed_by=auth.uid(),
      review_reason=coalesce(review_reason,'Evento cancelado'),updated_at=now()
  where project_id=p_project_id and status='PENDING';

  update public.staff_assignment_cancellations
  set republish_allowed=false,updated_at=now()
  where project_id=p_project_id and republish_allowed=true;
end $$;

revoke all on function public.close_cancelled_event_staff_flow(uuid) from public,anon;
grant execute on function public.close_cancelled_event_staff_flow(uuid) to authenticated;

commit;
