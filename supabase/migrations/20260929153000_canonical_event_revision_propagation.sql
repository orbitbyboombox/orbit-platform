begin;

alter table public.projects
  add column if not exists event_revision bigint not null default 0;

alter table public.calendar_sync
  add column if not exists current_event_revision bigint,
  add column if not exists last_synced_event_revision bigint;

create or replace function public.bump_project_event_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    old.event_date is distinct from new.event_date
    or old.event_time is distinct from new.event_time
    or old.event_time_mode is distinct from new.event_time_mode
    or old.location is distinct from new.location
    or old.city is distinct from new.city
    or old.project_type is distinct from new.project_type
    or old.operations is distinct from new.operations
    or old.status is distinct from new.status
  ) then
    new.event_revision := old.event_revision + 1;
  else
    new.event_revision := coalesce(new.event_revision, old.event_revision);
  end if;
  return new;
end;
$$;

drop trigger if exists projects_event_revision on public.projects;
create trigger projects_event_revision
before update on public.projects
for each row execute function public.bump_project_event_revision();

comment on column public.projects.event_revision is
  'Monotonic canonical event revision for operational consumers.';
comment on column public.calendar_sync.current_event_revision is
  'Canonical event revision represented by current_payload_hash.';
comment on column public.calendar_sync.last_synced_event_revision is
  'Canonical event revision verified on the remote Calendar event.';

commit;
