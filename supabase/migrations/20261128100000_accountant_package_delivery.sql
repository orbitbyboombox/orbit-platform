create table public.accountant_delivery_settings (
  singleton boolean primary key default true check (singleton),
  recipient text not null,
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);

create table public.accountant_package_deliveries (
  period date primary key check (extract(day from period) = 1),
  recipient text not null,
  package_checksum text not null check (package_checksum ~ '^[a-f0-9]{64}$'),
  status text not null default 'SENDING' check (status in ('SENDING','SENT','REVIEW_REQUIRED')),
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  sent_at timestamptz,
  gmail_message_id text
);

alter table public.accountant_delivery_settings enable row level security;
alter table public.accountant_package_deliveries enable row level security;
revoke all on public.accountant_delivery_settings, public.accountant_package_deliveries from public, anon, authenticated;
grant select, insert, update on public.accountant_delivery_settings, public.accountant_package_deliveries to service_role;

create function public.claim_accountant_package_delivery(
  p_period date, p_recipient text, p_checksum text, p_actor uuid
) returns boolean language plpgsql set search_path = '' as $$
declare
  v_recipient text;
  v_action text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('765652723:' || p_period::text, 0));
  select recipient into v_recipient from public.accountant_delivery_settings where singleton = true for share;
  select action into v_action from public.sii_rcv_period_events
    where company_rut = '765652723' and period = p_period and action in ('CLOSED','REOPENED')
    order by id desc limit 1;
  if p_period >= pg_catalog.date_trunc('month', now() at time zone 'America/Santiago')::date
    or v_recipient is distinct from p_recipient or v_action is distinct from 'CLOSED' then
    return false;
  end if;
  insert into public.accountant_package_deliveries(period, recipient, package_checksum, approved_by)
    values (p_period, p_recipient, p_checksum, p_actor)
    on conflict (period) do nothing;
  return found;
end;
$$;

revoke execute on function public.claim_accountant_package_delivery(date,text,text,uuid) from public, anon, authenticated;
grant execute on function public.claim_accountant_package_delivery(date,text,text,uuid) to service_role;
