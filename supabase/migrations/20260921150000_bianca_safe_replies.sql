begin;

create table if not exists public.bianca_safe_replies (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null default 'boombox',
  webhook_event_id uuid,
  provider_message_id text not null,
  conversation_id uuid not null,
  customer_id uuid not null,
  inbound_message text not null,
  detected_intents jsonb not null default '[]'::jsonb,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  proposed_response text not null,
  outgoing_reply text,
  requested_action text not null,
  guard_decisions jsonb not null default '{}'::jsonb,
  status text not null check (status in ('SENT','BLOCKED','HANDOFF')),
  handoff_status text not null check (handoff_status in ('NONE','REQUIRED')),
  block_reason text,
  created_at timestamptz not null default now(),
  unique(tenant_slug, provider_message_id)
);

create index if not exists bianca_safe_replies_conversation_idx
  on public.bianca_safe_replies(conversation_id, created_at desc);
create index if not exists bianca_safe_replies_status_idx
  on public.bianca_safe_replies(status, created_at desc);

alter table public.bianca_safe_replies enable row level security;
revoke all on public.bianca_safe_replies from anon, authenticated;

commit;
