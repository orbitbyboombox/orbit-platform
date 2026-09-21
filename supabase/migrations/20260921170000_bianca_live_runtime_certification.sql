begin;

create table if not exists public.bianca_live_runtime_certifications (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null default 'boombox',
  provider_message_id text not null,
  conversation_id uuid,
  customer_id uuid,
  opportunity_id uuid,
  runtime_version text not null default 'v4',
  source text not null default 'DIRECT_WHATSAPP',
  intents jsonb not null default '[]'::jsonb,
  requested_action text,
  confidence numeric(5,4) check (confidence between 0 and 1),
  webhook_received_at timestamptz,
  processing_started_at timestamptz,
  parser_done_at timestamptz,
  ai_started_at timestamptz,
  ai_completed_at timestamptz,
  evidence_done_at timestamptz,
  outbox_created_at timestamptz,
  meta_sent_at timestamptz,
  delivered_at timestamptz,
  final_contract_state text check (final_contract_state in ('RESPONSE_SENT','WAITING_HUMAN','INTENTIONALLY_SILENT','FAILED')),
  failure_code text,
  failure_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_slug, provider_message_id)
);

create index if not exists bianca_live_runtime_certifications_created_idx
  on public.bianca_live_runtime_certifications (tenant_slug, created_at desc);
create index if not exists bianca_live_runtime_certifications_conversation_idx
  on public.bianca_live_runtime_certifications (conversation_id, created_at desc);
create index if not exists bianca_live_runtime_certifications_state_idx
  on public.bianca_live_runtime_certifications (tenant_slug, final_contract_state, created_at desc);

alter table public.bianca_live_runtime_certifications enable row level security;
revoke all on public.bianca_live_runtime_certifications from anon, authenticated;
do $$ begin
  create policy bianca_live_runtime_certifications_founder_read
    on public.bianca_live_runtime_certifications
    for select to authenticated
    using (exists(select 1 from public.profiles where id = auth.uid() and role in ('CEO','ADMINISTRATOR','SALES')));
exception when duplicate_object then null; end $$;

create or replace function public.bianca_mark_stalled_runtime_outboxes(p_age_seconds integer default 60)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed integer := 0;
begin
  if to_regclass('public.whatsapp_outbound_messages') is null then
    return 0;
  end if;
  with stalled as (
    update public.whatsapp_outbound_messages
       set status = 'FAILED',
           last_error = 'DELIVERY_STALLED',
           updated_at = now()
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
comment on table public.bianca_live_runtime_certifications is 'Auditable BIANCA V4 production runtime certification ledger; no prompts or secrets.';
comment on function public.bianca_mark_stalled_runtime_outboxes(integer) is 'Fail-closed orphan detector for WhatsApp outboxes older than the certification threshold.';

commit;
