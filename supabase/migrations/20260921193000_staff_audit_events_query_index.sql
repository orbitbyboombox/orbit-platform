-- Staff management orders audit history by time after filtering by entity type.
-- This partial index avoids scanning the full append-only audit_events table.
create index if not exists audit_events_staff_entity_time_idx
  on public.audit_events (occurred_at desc, entity_id)
  where entity_type = 'staff';
