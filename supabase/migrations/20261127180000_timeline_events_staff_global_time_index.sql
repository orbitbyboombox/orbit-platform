SET LOCAL lock_timeout = '2s';
CREATE INDEX IF NOT EXISTS timeline_events_staff_global_time_idx
ON public.timeline_events (occurred_at DESC, id DESC) WHERE staff_id IS NOT NULL;
