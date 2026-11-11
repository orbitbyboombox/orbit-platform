-- Actual Staff query: staff_id IS NOT NULL ORDER BY occurred_at DESC LIMIT 500.
-- Existing (staff_id, occurred_at) cannot provide global chronological ordering.
-- Production EXPLAIN before: 1,121 buffer hits; 1,064 rows removed by filter;
-- 174.659 ms execution. No financial, inventory, event or notification rows change.
create index if not exists timeline_staff_recent_history_idx
on public.timeline_events (occurred_at desc, id desc)
where staff_id is not null;
