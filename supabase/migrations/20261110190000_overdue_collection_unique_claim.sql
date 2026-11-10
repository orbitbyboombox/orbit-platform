-- Prevent concurrent cron executions from sending duplicate weekly reminders.
CREATE UNIQUE INDEX IF NOT EXISTS communications_overdue_automatic_request_uidx
ON public.communications (project_id, communication_type, request_key)
WHERE communication_type = 'COLLECTION_OVERDUE_AUTOMATIC' AND request_key IS NOT NULL;
