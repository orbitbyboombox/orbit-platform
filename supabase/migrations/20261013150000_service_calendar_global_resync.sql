-- Global consistency rule: changing the canonical contracted service must enqueue Google Calendar resync.
-- Commercial quotation snapshots, signed agreements and payments remain immutable.
create or replace function public.queue_calendar_on_contracted_service_change()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.service_code is distinct from old.service_code
     or new.duration_hours is distinct from old.duration_hours then
    update public.calendar_sync
       set status = 'UPDATE_REQUIRED',
           next_retry_at = null,
           last_error = null,
           last_error_code = null,
           updated_at = now()
     where project_id = new.project_id
       and (nova_external_event_id is not null or external_event_id is not null)
       and status is distinct from 'SYNCING';
  end if;
  return new;
end;
$$;
drop trigger if exists project_services_calendar_resync on public.project_services;
create trigger project_services_calendar_resync
after update of service_code, duration_hours on public.project_services
for each row execute function public.queue_calendar_on_contracted_service_change();
