begin;

-- V2.1 Phase 1: make the isolated BIANCA TEST project reproduce the
-- production webhook/runtime contract without enabling commercial side effects.

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('META_CLOUD_API')),
  provider_message_id text not null,
  sender_wa_id text not null,
  profile_name text,
  message_type text not null,
  text_body text,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'RECEIVED' check (processing_status in ('RECEIVED','PROCESSING','PROCESSED','UNSUPPORTED','FAILED')),
  processing_error text,
  conversation_id uuid,
  customer_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_message_id)
);

create index if not exists whatsapp_webhook_events_status_idx
  on public.whatsapp_webhook_events (processing_status, occurred_at);
create index if not exists whatsapp_webhook_events_sender_idx
  on public.whatsapp_webhook_events (sender_wa_id, occurred_at desc);
alter table public.whatsapp_webhook_events enable row level security;

create table if not exists public.whatsapp_outbound_messages (
  id uuid primary key default gen_random_uuid(),
  correlation_id text not null unique,
  conversation_id uuid not null references public.conversation_states(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  recipient_wa_id text not null,
  message_type text not null default 'text' check (message_type in ('text')),
  text_body text not null,
  status text not null default 'PENDING' check (status in ('PENDING','SENDING','SENT','FAILED','AMBIGUOUS')),
  provider_message_id text,
  attempt_count integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_outbound_messages_pending_idx
  on public.whatsapp_outbound_messages (status, created_at)
  where status in ('PENDING','FAILED');
alter table public.whatsapp_outbound_messages enable row level security;

create or replace function public.normalize_whatsapp_phone(p_value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  digits text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
begin
  if digits like '00%' then digits := substr(digits, 3); end if;
  if digits like '056%' then digits := substr(digits, 2); end if;
  if length(digits) = 9 and digits like '9%' then digits := '56' || digits; end if;
  if length(digits) < 8 or length(digits) > 15 or digits like '0%' then return null; end if;
  return digits;
end;
$$;

create or replace function public.resolve_whatsapp_customer(
  p_sender_wa_id text,
  p_profile_name text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text := public.normalize_whatsapp_phone(p_sender_wa_id);
  resolved_id uuid;
  display_name text := coalesce(nullif(trim(p_profile_name), ''), 'Cliente WhatsApp');
  fallback_email text;
begin
  if normalized_phone is null then raise exception 'WHATSAPP_PHONE_REQUIRED'; end if;
  fallback_email := 'whatsapp-' || normalized_phone || '@inbound.invalid';

  select c.id into resolved_id
  from public.customers c
  where c.deleted_at is null
    and public.normalize_whatsapp_phone(c.phone) = normalized_phone
  order by c.created_at asc
  limit 1;

  if resolved_id is not null then
    update public.customers
    set
      full_name = case when full_name is null or trim(full_name) = '' or full_name = 'Cliente WhatsApp' then display_name else full_name end,
      phone = case when phone is null or trim(phone) = '' then '+' || normalized_phone else phone end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('whatsappWaId', normalized_phone, 'whatsappLastSeenAt', now()),
      updated_at = now()
    where id = resolved_id;
    return resolved_id;
  end if;

  insert into public.customers(full_name, email, phone, metadata)
  values(display_name, fallback_email, '+' || normalized_phone, jsonb_build_object(
    'leadSource', 'WHATSAPP',
    'whatsappWaId', normalized_phone,
    'whatsappFirstSeenAt', now(),
    'whatsappLastSeenAt', now(),
    'emailPlaceholder', true
  ))
  returning id into resolved_id;
  return resolved_id;
end;
$$;

revoke all on function public.normalize_whatsapp_phone(text) from public, anon, authenticated;
grant execute on function public.normalize_whatsapp_phone(text) to service_role;
revoke all on function public.resolve_whatsapp_customer(text,text) from public, anon, authenticated;
grant execute on function public.resolve_whatsapp_customer(text,text) to service_role;

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

-- The TEST project already has the canonical commercial_sends table. These
-- additive columns/indexes make its email ledger compatible with Production.
alter table public.commercial_sends add column if not exists opportunity_id uuid;
alter table public.commercial_sends add column if not exists conversation_id uuid;
alter table public.commercial_sends add column if not exists idempotency_key uuid;
create unique index if not exists commercial_sends_idempotency_uidx
  on public.commercial_sends(idempotency_key) where idempotency_key is not null;
create index if not exists commercial_sends_recipient_idx
  on public.commercial_sends(recipient_email, sent_at desc);
alter table public.commercial_sends enable row level security;
revoke all on public.commercial_sends from anon, authenticated;

-- Opportunity state is intentionally embedded in customer_memory and
-- conversation_states in V2.1 Phase 1. No second canonical opportunities table
-- is created.

create or replace function public.bianca_mark_stalled_runtime_outboxes(p_age_seconds integer default 60)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed integer := 0;
begin
  with stalled as (
    update public.whatsapp_outbound_messages
       set status = 'FAILED', last_error = 'DELIVERY_STALLED', updated_at = now()
     where status = 'PENDING'
       and updated_at < now() - make_interval(secs => greatest(p_age_seconds, 1))
    returning correlation_id
  )
  update public.bianca_live_runtime_certifications c
     set final_contract_state = 'FAILED',
         failure_code = 'DELIVERY_STALLED',
         failure_detail = 'WhatsApp outbox remained PENDING beyond the certification threshold.',
         updated_at = now()
   where c.provider_message_id in (select correlation_id from stalled)
     and c.final_contract_state is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.bianca_mark_stalled_runtime_outboxes(integer) from public;

commit;
