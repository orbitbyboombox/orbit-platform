-- Isolated audit log for synthetic administrative D-10 email tests.
-- It deliberately has no customer/project foreign keys and cannot affect operational mail history.
CREATE TABLE IF NOT EXISTS public.pre_event_admin_test_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  test_type text NOT NULL DEFAULT 'PRE_EVENT_REMINDER_ADMIN_TEST'
    CHECK (test_type = 'PRE_EVENT_REMINDER_ADMIN_TEST'),
  request_key text NOT NULL UNIQUE,
  recipient text NOT NULL
    CHECK (recipient = 'matias.maira.larrain@gmail.com'),
  subject text NOT NULL
    CHECK (subject = 'PRUEBA D-10 · BOOMBOX'),
  body text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  external_message_id text,
  failure_reason text,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.pre_event_admin_test_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pre_event_admin_test_logs FROM anon, authenticated;
GRANT ALL ON public.pre_event_admin_test_logs TO service_role;
