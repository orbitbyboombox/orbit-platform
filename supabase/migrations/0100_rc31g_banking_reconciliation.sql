begin;

create table if not exists public.finance_bank_accounts(
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  account_kind text not null check(account_kind in('BANK','PAYMENT_GATEWAY')),
  account_type text,
  bank_name text,
  currency text not null default 'CLP',
  is_primary boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}',
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);

create table if not exists public.finance_recurring_expense_rules(
  id uuid primary key default gen_random_uuid(), bank_account_id uuid references public.finance_bank_accounts(id),
  name text not null, category text not null, amount numeric(14,2) not null check(amount>0),
  frequency text not null check(frequency in('MONTHLY','QUARTERLY','ANNUAL')),
  due_day integer not null check(due_day between 1 and 28), next_due_date date not null,
  active boolean not null default true, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create unique index if not exists finance_recurring_rule_name_active on public.finance_recurring_expense_rules(lower(name)) where active;

create table if not exists public.finance_recurring_expense_runs(
  id uuid primary key default gen_random_uuid(), rule_id uuid not null references public.finance_recurring_expense_rules(id),
  accounting_month date not null, expense_id uuid not null references public.expenses(id), generated_at timestamptz not null default now(),
  unique(rule_id,accounting_month)
);

create table if not exists public.bank_reconciliation_imports(
  id uuid primary key default gen_random_uuid(), bank_account_id uuid not null references public.finance_bank_accounts(id),
  source text not null default 'UPLOAD' check(source in('UPLOAD','MERCADO_PAGO')),
  original_document_path text not null, original_document_name text not null, mime_type text not null, checksum text not null,
  transfer_date date, transfer_time time, amount numeric(14,2), origin_bank text, transfer_holder text,
  reference text, destination_account text, extraction_confidence numeric(5,2), extraction_payload jsonb not null default '{}',
  status text not null default 'PROCESSING' check(status in('PROCESSING','REVIEW_REQUIRED','SUGGESTED','CONFIRMED','REJECTED','FAILED')),
  matched_customer_id uuid references public.customers(id), matched_project_id uuid references public.projects(id),
  matched_invoice_id uuid references public.invoices(id), payment_id uuid unique references public.invoice_payments(id),
  uploaded_by uuid not null references auth.users(id), confirmed_by uuid references auth.users(id), confirmed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(checksum,bank_account_id)
);

create table if not exists public.bank_reconciliation_candidates(
  id uuid primary key default gen_random_uuid(), import_id uuid not null references public.bank_reconciliation_imports(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id), customer_id uuid not null references public.customers(id),
  project_id uuid not null references public.projects(id), score numeric(5,2) not null, reasons jsonb not null default '[]',
  candidate_rank integer not null, created_at timestamptz not null default now(), unique(import_id,invoice_id)
);

create table if not exists public.bank_reconciliation_audit(
  id bigint generated always as identity primary key, import_id uuid not null references public.bank_reconciliation_imports(id),
  action text not null, actor_id uuid references auth.users(id), previous_state jsonb, new_state jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mercado_pago_transactions(
  id uuid primary key default gen_random_uuid(), external_id text not null unique, import_id uuid references public.bank_reconciliation_imports(id),
  invoice_id uuid references public.invoices(id), project_id uuid references public.projects(id), payment_id uuid references public.invoice_payments(id),
  gross_amount numeric(14,2) not null, fee_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) generated always as (gross_amount-fee_amount) stored,
  settlement_status text not null, transfer_status text not null, available_at timestamptz, transferred_at timestamptz,
  provider_payload jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

insert into public.finance_bank_accounts(code,name,account_kind,account_type,bank_name,is_primary,metadata)
values('BCI_PRIMARY','Banco BCI','BANK','Cuenta Corriente','BCI',true,'{"description":"Cuenta principal empresa"}'),
      ('MERCADO_PAGO','Mercado Pago','PAYMENT_GATEWAY','Gateway de pagos','Mercado Pago',false,'{}')
on conflict(code) do update set name=excluded.name,account_kind=excluded.account_kind,account_type=excluded.account_type,bank_name=excluded.bank_name;

insert into public.finance_recurring_expense_rules(bank_account_id,name,category,amount,frequency,due_day,next_due_date)
select id,'Comisión mensual Banco BCI','BANK_CHARGES',15000,'MONTHLY',1,date_trunc('month',current_date)::date
from public.finance_bank_accounts where code='BCI_PRIMARY'
on conflict do nothing;

create or replace function public.generate_recurring_finance_expenses(p_as_of date default current_date)
returns integer language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); item record; expense_id uuid; generated integer:=0; period_start date;
begin
  if actor is null or not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  for item in select * from finance_recurring_expense_rules where active and next_due_date<=p_as_of loop
    period_start:=date_trunc('month',item.next_due_date)::date;
    if not exists(select 1 from finance_recurring_expense_runs where rule_id=item.id and accounting_month=period_start) then
      insert into expenses(category,supplier,occurred_on,subtotal,vat,total,status,approval_reason,created_by,updated_by)
      values(item.category,item.name,item.next_due_date,item.amount,0,item.amount,'PENDING',jsonb_build_object('recurringRuleId',item.id,'bankAccountId',item.bank_account_id,'canonicalSource','RECURRING_EXPENSE')::text,actor,actor)
      returning id into expense_id;
      insert into finance_recurring_expense_runs(rule_id,accounting_month,expense_id) values(item.id,period_start,expense_id);
      generated:=generated+1;
    end if;
    update finance_recurring_expense_rules set next_due_date=case item.frequency when 'MONTHLY' then (item.next_due_date+interval '1 month')::date when 'QUARTERLY' then (item.next_due_date+interval '3 months')::date else (item.next_due_date+interval '1 year')::date end,updated_by=actor,updated_at=now() where id=item.id;
  end loop;
  return generated;
end$$;

create or replace function public.confirm_bank_reconciliation(p_import_id uuid,p_invoice_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); item bank_reconciliation_imports%rowtype; inv invoices%rowtype; payment uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  select * into item from bank_reconciliation_imports where id=p_import_id for update;
  if not found then raise exception 'Importación no encontrada.'; end if;
  if item.status='CONFIRMED' then return item.payment_id; end if;
  if item.status not in('SUGGESTED','REVIEW_REQUIRED') then raise exception 'La conciliación no está disponible para confirmar.'; end if;
  select * into inv from invoices where id=p_invoice_id and deleted_at is null for update;
  if not found or inv.status='CANCELLED' then raise exception 'Cuenta por cobrar activa no encontrada.'; end if;
  if item.amount is null or item.amount<=0 or item.amount>greatest(inv.amount-inv.paid_amount,0) then raise exception 'El monto importado no coincide con un saldo disponible.'; end if;
  payment:=public.register_receivable_payment(inv.id,item.amount,coalesce(item.transfer_date,current_date)::timestamptz,
    case when item.source='MERCADO_PAGO' then 'MERCADO_PAGO' else 'TRANSFER' end,item.original_document_path,item.original_document_name,
    'Pago confirmado desde conciliación bancaria '||item.id::text);
  update bank_reconciliation_imports set status='CONFIRMED',matched_customer_id=inv.customer_id,matched_project_id=inv.project_id,
    matched_invoice_id=inv.id,payment_id=payment,confirmed_by=actor,confirmed_at=now(),updated_at=now() where id=item.id;
  insert into bank_reconciliation_audit(import_id,action,actor_id,new_state) values(item.id,'PAYMENT_CONFIRMED',actor,jsonb_build_object('invoiceId',inv.id,'paymentId',payment,'amount',item.amount));
  return payment;
end$$;

alter table public.finance_bank_accounts enable row level security;
alter table public.finance_recurring_expense_rules enable row level security;
alter table public.finance_recurring_expense_runs enable row level security;
alter table public.bank_reconciliation_imports enable row level security;
alter table public.bank_reconciliation_candidates enable row level security;
alter table public.bank_reconciliation_audit enable row level security;
alter table public.mercado_pago_transactions enable row level security;
do $$ declare t text; begin foreach t in array array['finance_bank_accounts','finance_recurring_expense_rules','finance_recurring_expense_runs','bank_reconciliation_imports','bank_reconciliation_candidates','bank_reconciliation_audit','mercado_pago_transactions'] loop
  execute format('create policy %I_founder_all on public.%I for all using(public.can_administer()) with check(public.can_administer())',t,t);
end loop; end$$;
revoke all on function public.generate_recurring_finance_expenses(date),public.confirm_bank_reconciliation(uuid,uuid) from public,anon;
grant execute on function public.generate_recurring_finance_expenses(date),public.confirm_bank_reconciliation(uuid,uuid) to authenticated;
revoke update,delete on public.bank_reconciliation_audit from authenticated;

commit;
