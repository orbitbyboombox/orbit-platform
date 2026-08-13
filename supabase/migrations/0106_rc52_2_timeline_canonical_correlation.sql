begin;

-- Timeline correlation IDs are the canonical idempotency key for operational
-- actions. RC-52.2 uses ON CONFLICT(correlation_id), which requires a matching
-- non-partial UNIQUE constraint.
alter table public.timeline_events
  drop constraint if exists timeline_events_correlation_id_key;

alter table public.timeline_events
  add constraint timeline_events_correlation_id_key unique (correlation_id);

commit;
