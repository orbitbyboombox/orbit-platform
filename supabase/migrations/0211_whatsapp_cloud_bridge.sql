begin;

create table if not exists public.whatsapp_identities (
  wa_id text primary key,
  customer_id uuid not null references public.customers(id) on delete restrict,
  phone_number_id text not null,
  profile_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_webhook_events (
  provider_event_id text primary key,
  event_kind text not null,
  wa_id text,
  phone_number_id text,
  payload jsonb not null default '{}',
  processing_status text not null default 'RECEIVED' check (processing_status in ('RECEIVED','PROCESSED','IGNORED','FAILED')),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists whatsapp_identities_customer_idx on public.whatsapp_identities(customer_id);
create index if not exists whatsapp_webhook_events_received_idx on public.whatsapp_webhook_events(received_at desc);
create index if not exists whatsapp_webhook_events_status_idx on public.whatsapp_webhook_events(processing_status,received_at desc);

alter table public.whatsapp_identities enable row level security;
alter table public.whatsapp_webhook_events enable row level security;

drop policy if exists whatsapp_identities_internal_read on public.whatsapp_identities;
create policy whatsapp_identities_internal_read on public.whatsapp_identities for select using (public.is_internal_user());
drop policy if exists whatsapp_webhook_events_internal_read on public.whatsapp_webhook_events;
create policy whatsapp_webhook_events_internal_read on public.whatsapp_webhook_events for select using (public.is_internal_user());

revoke insert,update,delete,truncate on public.whatsapp_identities from public,anon,authenticated;
revoke insert,update,delete,truncate on public.whatsapp_webhook_events from public,anon,authenticated;

commit;
