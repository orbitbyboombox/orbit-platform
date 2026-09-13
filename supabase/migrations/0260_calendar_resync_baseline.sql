-- Existing mappings are an operational baseline; do not trigger remote updates.
update public.calendar_sync
   set current_payload_hash = coalesce(current_payload_hash, payload_hash),
       last_synced_payload_hash = coalesce(last_synced_payload_hash, payload_hash),
       status = case when status in ('ERROR','UPDATE_REQUIRED') then status else 'SYNCHRONIZED' end,
       retry_count = coalesce(retry_count, 0)
 where current_payload_hash is null
   and payload_hash is not null;
