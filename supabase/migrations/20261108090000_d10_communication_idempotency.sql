begin;

-- Durable claim keys prevent duplicate D-10 messages across overlapping cron runs.
-- A queued or failed attempt is intentionally not retried automatically because
-- Gmail acceptance can be ambiguous when a request times out.
create unique index if not exists communications_d10_request_uidx
  on public.communications(project_id, communication_type, request_key)
  where communication_type in ('COLLECTION_D10', 'EVENT_READY_D10')
    and request_key is not null;

create index if not exists communications_d10_history_idx
  on public.communications(project_id, occurred_at desc)
  where communication_type in ('COLLECTION_D10', 'EVENT_READY_D10');

commit;
