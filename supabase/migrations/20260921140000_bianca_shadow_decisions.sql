begin;

create table if not exists public.bianca_shadow_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null default 'boombox',
  webhook_event_id uuid,
  provider_message_id text not null,
  conversation_id uuid,
  customer_id uuid,
  client_message text not null,
  actual_response text,
  detected_intents jsonb not null default '[]'::jsonb,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  proposed_response text not null,
  proposed_tools jsonb not null default '[]'::jsonb,
  proposed_action text not null,
  missing_information jsonb not null default '[]'::jsonb,
  handoff_reason text,
  blocked_side_effects jsonb not null default '["SEND_EMAIL","QUOTE_CREATE","RESERVATION_START"]'::jsonb,
  status text not null default 'SHADOW_PROPOSED' check (status in ('SHADOW_PROPOSED','EXECUTED')),
  claim_block_count integer not null default 0,
  duplicate_prevented boolean not null default false,
  proposed_quote_correct boolean,
  review_status text not null default 'PENDING' check (review_status in ('PENDING','REVIEWED')),
  review_labels jsonb not null default '{}'::jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(tenant_slug, provider_message_id)
);

create index if not exists bianca_shadow_decisions_conversation_idx
  on public.bianca_shadow_decisions(conversation_id, created_at desc);
create index if not exists bianca_shadow_decisions_intent_idx
  on public.bianca_shadow_decisions using gin(detected_intents);
create index if not exists bianca_shadow_decisions_review_idx
  on public.bianca_shadow_decisions(review_status, created_at desc);

alter table public.bianca_shadow_decisions enable row level security;
revoke all on public.bianca_shadow_decisions from anon, authenticated;

commit;
