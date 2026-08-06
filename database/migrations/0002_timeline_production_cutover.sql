begin;

alter table public.timeline_events
  add column if not exists orbit_event_id text,
  add column if not exists actor_id uuid references auth.users(id),
  add column if not exists actor_label text,
  add column if not exists source text,
  add column if not exists action text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists human_message text,
  add column if not exists correlation_id text,
  add column if not exists staff_id uuid references public.staff(id),
  add column if not exists communication_id uuid references public.communications(id),
  add column if not exists agreement_id uuid references public.agreements(id),
  add column if not exists calendar_sync_id uuid references public.calendar_sync(id);

update public.timeline_events
set
  orbit_event_id = coalesce(orbit_event_id, 'LEGACY-' || id::text),
  actor_id = coalesce(actor_id, created_by),
  actor_label = coalesce(actor_label, 'Sistema'),
  source = coalesce(source, 'System'),
  action = coalesce(action, event_type),
  entity_type = coalesce(entity_type, case when project_id is not null then 'Project' else 'Customer' end),
  entity_id = coalesce(entity_id, project_id::text, customer_id::text, id::text),
  human_message = coalesce(human_message, description, title),
  correlation_id = coalesce(correlation_id, 'legacy-' || id::text)
where orbit_event_id is null
   or source is null
   or action is null
   or entity_type is null
   or entity_id is null
   or human_message is null
   or correlation_id is null;

alter table public.timeline_events
  alter column orbit_event_id set not null,
  alter column actor_label set not null,
  alter column source set not null,
  alter column action set not null,
  alter column entity_type set not null,
  alter column entity_id set not null,
  alter column human_message set not null,
  alter column correlation_id set not null;

alter table public.timeline_events
  add constraint timeline_events_source_check check (source in ('Customer','NOVA','Staff','Operations','Calendar','Drive','Gmail','System','Administrator','Google Workspace','Future Meta')) not valid;
alter table public.timeline_events validate constraint timeline_events_source_check;

create index if not exists timeline_customer_time_idx on public.timeline_events(customer_id, occurred_at desc, id desc);
create index if not exists timeline_staff_time_idx on public.timeline_events(staff_id, occurred_at desc, id desc);
create index if not exists timeline_communication_time_idx on public.timeline_events(communication_id, occurred_at desc, id desc);
create index if not exists timeline_agreement_time_idx on public.timeline_events(agreement_id, occurred_at desc, id desc);
create index if not exists timeline_calendar_time_idx on public.timeline_events(calendar_sync_id, occurred_at desc, id desc);
create unique index if not exists timeline_correlation_action_idx on public.timeline_events(correlation_id, action, entity_type, entity_id);

create or replace function public.prevent_timeline_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'timeline_events is append-only';
end;
$$;

drop trigger if exists timeline_events_immutable on public.timeline_events;
create trigger timeline_events_immutable
before update or delete on public.timeline_events
for each row execute function public.prevent_timeline_mutation();

revoke update, delete on public.timeline_events from anon, authenticated;

commit;
