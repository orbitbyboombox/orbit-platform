begin;

-- Phase 2 WhatsApp transport hardening. The current Production deployment is
-- single-tenant BOOMBOX; every WhatsApp row carries that boundary explicitly
-- so a future WABA cannot share the same ledgers accidentally.
alter table public.whatsapp_webhook_events
  add column if not exists tenant_slug text not null default 'boombox',
  add column if not exists waba_id text,
  add column if not exists phone_number_id text,
  add column if not exists event_kind text not null default 'MESSAGE';

alter table public.whatsapp_outbound_messages
  add column if not exists tenant_slug text not null default 'boombox',
  add column if not exists message_mode text not null default 'TEXT',
  add column if not exists template_name text,
  add column if not exists template_language text,
  add column if not exists template_parameters jsonb not null default '[]'::jsonb,
  add column if not exists service_window_expires_at timestamptz,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists provider_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists provider_error_code text,
  add column if not exists provider_error_message text;

alter table public.whatsapp_outbound_messages
  drop constraint if exists whatsapp_outbound_messages_status_check,
  drop constraint if exists whatsapp_outbound_messages_message_mode_check;

alter table public.whatsapp_outbound_messages
  add constraint whatsapp_outbound_messages_status_check
    check (status in ('PENDING','SENDING','SENT','FAILED','AMBIGUOUS','BLOCKED_WINDOW')),
  add constraint whatsapp_outbound_messages_message_mode_check
    check (message_mode in ('TEXT','TEMPLATE'));

alter table public.conversation_states
  add column if not exists tenant_slug text not null default 'boombox';

alter table public.communications
  add column if not exists tenant_slug text not null default 'boombox';

create table if not exists public.whatsapp_message_status_events (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null default 'boombox',
  provider text not null check (provider = 'META_CLOUD_API'),
  provider_status_id text not null,
  provider_message_id text not null,
  recipient_wa_id text,
  status text not null check (status in ('sent','delivered','read','failed')),
  status_code text,
  status_message text,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_slug, provider_status_id, status)
);

alter table public.whatsapp_message_status_events enable row level security;

create index if not exists whatsapp_webhook_events_tenant_idx
  on public.whatsapp_webhook_events (tenant_slug, processing_status, occurred_at desc);

create index if not exists whatsapp_outbound_messages_tenant_status_idx
  on public.whatsapp_outbound_messages (tenant_slug, status, created_at desc);

create index if not exists whatsapp_outbound_messages_provider_idx
  on public.whatsapp_outbound_messages (tenant_slug, provider_message_id)
  where provider_message_id is not null;

create index if not exists whatsapp_status_events_message_idx
  on public.whatsapp_message_status_events (tenant_slug, provider_message_id, occurred_at desc);

comment on column public.whatsapp_webhook_events.tenant_slug is
  'Normalized ORBIT tenant boundary; WhatsApp Phase 2 currently accepts boombox only.';

comment on column public.whatsapp_outbound_messages.service_window_expires_at is
  'The 24-hour customer-service window at the moment this message was queued.';

commit;
