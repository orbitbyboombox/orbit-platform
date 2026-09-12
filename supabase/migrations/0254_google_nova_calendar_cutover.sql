-- Reversible mapping for Google Calendar primary -> NOVA secondary cutover.
-- Legacy identifiers remain preserved during the observation period.
alter table public.calendar_sync
  add column if not exists legacy_external_event_id text,
  add column if not exists legacy_external_url text,
  add column if not exists nova_external_event_id text,
  add column if not exists nova_external_url text,
  add column if not exists nova_calendar_id text,
  add column if not exists nova_migration_status text,
  add column if not exists nova_migrated_at timestamptz,
  add column if not exists nova_migration_error jsonb;

update public.calendar_sync
set legacy_external_event_id = coalesce(legacy_external_event_id, external_event_id),
    legacy_external_url = coalesce(legacy_external_url, external_url)
where external_event_id is not null
  and legacy_external_event_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'calendar_sync_nova_migration_status_check'
      and conrelid = 'public.calendar_sync'::regclass
  ) then
    alter table public.calendar_sync
      add constraint calendar_sync_nova_migration_status_check
      check (nova_migration_status is null or nova_migration_status in ('PENDING','MIGRATED','SKIPPED_DELETED','ERROR'));
  end if;
end
$$;

create unique index if not exists calendar_sync_nova_external_event_id_uidx
  on public.calendar_sync (nova_external_event_id)
  where nova_external_event_id is not null;

comment on column public.calendar_sync.legacy_external_event_id is
  'Read-only rollback reference to the legacy Google primary calendar event.';
comment on column public.calendar_sync.nova_external_event_id is
  'Active NOVA secondary-calendar event after validated cutover.';
