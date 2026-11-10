-- Keep administrative synthetic D-10 tests uniquely logged and separate from client reminders.
CREATE UNIQUE INDEX IF NOT EXISTS communications_pre_event_admin_test_request_uidx
ON public.communications (request_key)
WHERE communication_type = 'PRE_EVENT_REMINDER_ADMIN_TEST'
  AND request_key IS NOT NULL;
