create table public.sii_received_fees (
  id uuid primary key default gen_random_uuid(),
  company_rut text not null,
  issuer_rut text not null check (issuer_rut ~ '^[0-9]{7,8}[0-9K]$'),
  issuer_name text not null check (length(btrim(issuer_name)) between 1 and 150),
  folio text not null check (folio ~ '^[1-9][0-9]{0,17}$'),
  issued_on date not null,
  period date not null check (extract(day from period) = 1),
  gross bigint not null check (gross > 0),
  withheld bigint not null check (withheld >= 0 and withheld <= gross),
  net bigint generated always as (gross - withheld) stored,
  document_pdf bytea check (octet_length(document_pdf) <= 750000),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (company_rut,issuer_rut,folio)
);

alter table public.sii_received_fees enable row level security;
revoke all on public.sii_received_fees from public, anon, authenticated;
grant select, insert on public.sii_received_fees to service_role;
create trigger sii_fees_guard_closed_period before insert on public.sii_received_fees
for each row execute function public.sii_rcv_guard_closed_period();

create function public.sii_received_fees_report(p_company text,p_start date,p_end date)
returns table(id uuid,issuer_rut text,issuer_name text,folio text,issued_on date,gross bigint,withheld bigint,net bigint,has_pdf boolean,staff_matches bigint,staff_account_id uuid,staff_amount_matches boolean)
language sql stable set search_path = '' as $$
  select f.id,f.issuer_rut,f.issuer_name,f.folio,f.issued_on,f.gross,f.withheld,f.net,
    f.document_pdf is not null, matches.total,a.id,
    case when a.boleta_gross is not null and a.withholding_amount is not null and a.boleta_net is not null
      then a.boleta_gross = f.gross and a.withholding_amount = f.withheld and a.boleta_net = f.net end
  from public.sii_received_fees f
  left join lateral (
    select count(*) as total, (array_agg(s.id order by s.id))[1] as staff_id
    from public.staff s where s.deleted_at is null
      and regexp_replace(upper(s.rut),'[^0-9K]','','g') = f.issuer_rut
  ) matches on true
  left join lateral (
    select (array_agg(m.id order by m.id))[1] as account_id
    from public.staff_monthly_accounts m
    where matches.total = 1 and m.staff_id = matches.staff_id and m.accounting_month = f.period
    having count(*) = 1
  ) account on true
  left join public.staff_monthly_accounts a on a.id = account.account_id
  where f.company_rut = p_company and f.period >= p_start and f.period < p_end
  order by f.issued_on desc,f.id
$$;
revoke execute on function public.sii_received_fees_report(text,date,date) from public, anon, authenticated;
grant execute on function public.sii_received_fees_report(text,date,date) to service_role;
