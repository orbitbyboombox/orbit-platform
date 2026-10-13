-- The calendar worker accepts STALE but not UPDATE_REQUIRED.
-- Preserve all commercial documents and payments.
create or replace function public.queue_calendar_on_contracted_service_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.service_code is distinct from old.service_code
     or new.duration_hours is distinct from old.duration_hours then
    update public.calendar_sync
       set status = 'STALE',
           next_retry_at = null,
           last_error = null,
           last_error_code = null,
           updated_at = now()
     where project_id = new.project_id
       and (nova_external_event_id is not null or external_event_id is not null);
  end if;
  return new;
end;
$$;
