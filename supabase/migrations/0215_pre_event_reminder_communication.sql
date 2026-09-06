begin;

-- Immutable render/input snapshot for auditable customer communications. This
-- stores only operational/financial references and never mutates their sources.
alter table public.communications
  add column if not exists context_snapshot jsonb not null default '{}'::jsonb;

create unique index if not exists communications_pre_event_reminder_request_uidx
  on public.communications(project_id, communication_type, request_key)
  where communication_type = 'PRE_EVENT_REMINDER'
    and request_key is not null;

create index if not exists communications_pre_event_reminder_history_idx
  on public.communications(project_id, occurred_at desc)
  where communication_type = 'PRE_EVENT_REMINDER';

comment on column public.communications.context_snapshot is
  'Immutable, secret-free source references and conditional render state used for an outbound communication attempt.';

commit;
