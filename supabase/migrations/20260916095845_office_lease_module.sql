begin;

-- Arriendo Oficina is its own operational owner. Payments are immutable ledger
-- movements and never enter the customer receivables or Staff settlement paths.
create table public.office_lease_settings (
  id uuid primary key default gen_random_uuid(),
  settings_key text not null unique default 'PRIMARY' check (settings_key = 'PRIMARY'),
  tenant_legal_name text not null,
  tenant_rut text not null,
  tenant_address text not null,
  tenant_email text,
  tenant_phone text,
  tenant_representative text,
  contract_start_date date,
  contract_end_date date,
  observations text,
  unit_name text not null,
  property_address text,
  concept text not null,
  monthly_amount numeric(14,2) not null check (monthly_amount > 0),
  common_expenses_included boolean not null default true,
  due_day smallint not null default 5 check (due_day between 1 and 28),
  mortgage_cost numeric(14,2) not null default 0 check (mortgage_cost >= 0),
  common_expenses_cost numeric(14,2) not null default 0 check (common_expenses_cost >= 0),
  version integer not null default 1,
  approval_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  check (contract_end_date is null or contract_start_date is null or contract_end_date >= contract_start_date)
);

insert into public.office_lease_settings (
  settings_key, tenant_legal_name, tenant_rut, tenant_address, tenant_email,
  tenant_representative, unit_name, property_address, concept, monthly_amount,
  common_expenses_included, due_day, mortgage_cost, common_expenses_cost,
  observations
) values (
  'PRIMARY',
  'IMPORTADORA Y COMERCIALIZADORA ESTALLIDO SpA',
  '77.413.411-5',
  'Guillermo Mann N.º 1305, departamento 1404, Ñuñoa, Región Metropolitana',
  'heber@emimax.cl',
  'Heber Eliecer Gatica Gatica',
  'Oficina 310',
  'Puerta Oriente N.º 361, Colina, Región Metropolitana',
  'Arriendo Oficina 310',
  450000,
  true,
  5,
  505000,
  110000,
  'Ficha inicial basada en el comprobante entregado por Founder. Completar teléfono y vigencia contractual desde Administración.'
) on conflict (settings_key) do nothing;

create table public.office_lease_obligations (
  id uuid primary key default gen_random_uuid(),
  settings_id uuid not null references public.office_lease_settings(id),
  period date not null check (period = date_trunc('month', period)::date),
  amount_due numeric(14,2) not null check (amount_due > 0),
  due_date date not null,
  status text not null default 'PENDING' check (status in ('PENDING','PAID')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (settings_id, period)
);

create table public.office_lease_payments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.office_lease_obligations(id),
  amount numeric(14,2) not null check (amount > 0),
  paid_on date not null,
  payment_method text not null,
  observation text,
  receipt_number integer not null unique check (receipt_number > 0),
  idempotency_key text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.office_lease_documents (
  id uuid primary key default gen_random_uuid(),
  settings_id uuid not null references public.office_lease_settings(id),
  obligation_id uuid references public.office_lease_obligations(id),
  payment_id uuid references public.office_lease_payments(id),
  document_type text not null check (document_type in ('CONTRACT','PAYMENT_PROOF','INCOME_RECEIPT','ADDITIONAL')),
  storage_bucket text not null default 'orbit-documents' check (storage_bucket = 'orbit-documents'),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  checksum text not null,
  idempotency_key text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.office_lease_receipt_counter (
  counter_key text primary key check (counter_key = 'PRIMARY'),
  next_number integer not null check (next_number > 0)
);
insert into public.office_lease_receipt_counter(counter_key,next_number)
values ('PRIMARY',1) on conflict (counter_key) do nothing;

create unique index office_lease_payment_proof_uq
  on public.office_lease_documents(payment_id)
  where payment_id is not null and document_type='PAYMENT_PROOF' and deleted_at is null;
create unique index office_lease_income_receipt_uq
  on public.office_lease_documents(payment_id)
  where payment_id is not null and document_type='INCOME_RECEIPT' and deleted_at is null;
create index office_lease_obligations_period_idx on public.office_lease_obligations(period desc);
create index office_lease_payments_date_idx on public.office_lease_payments(paid_on desc,created_at desc);
create index office_lease_documents_month_idx on public.office_lease_documents(obligation_id,created_at desc) where deleted_at is null;

alter table public.office_lease_settings enable row level security;
alter table public.office_lease_obligations enable row level security;
alter table public.office_lease_payments enable row level security;
alter table public.office_lease_documents enable row level security;
alter table public.office_lease_receipt_counter enable row level security;

revoke all on table public.office_lease_settings from anon,authenticated;
revoke all on table public.office_lease_obligations from anon,authenticated;
revoke all on table public.office_lease_payments from anon,authenticated;
revoke all on table public.office_lease_documents from anon,authenticated;
revoke all on table public.office_lease_receipt_counter from anon,authenticated;
grant select,update on table public.office_lease_settings to authenticated;
grant select on table public.office_lease_obligations,public.office_lease_payments,public.office_lease_documents to authenticated;

create policy office_lease_settings_admin_select on public.office_lease_settings
  for select to authenticated using (public.can_administer());
create policy office_lease_settings_admin_update on public.office_lease_settings
  for update to authenticated using (public.can_administer()) with check (public.can_administer());
create policy office_lease_obligations_admin_select on public.office_lease_obligations
  for select to authenticated using (public.can_administer());
create policy office_lease_payments_admin_select on public.office_lease_payments
  for select to authenticated using (public.can_administer());
create policy office_lease_documents_admin_select on public.office_lease_documents
  for select to authenticated using (public.can_administer());

drop trigger if exists office_lease_settings_touch on public.office_lease_settings;
create trigger office_lease_settings_touch before update on public.office_lease_settings
for each row execute function public.touch_versioned_row();
drop trigger if exists office_lease_settings_audit on public.office_lease_settings;
create trigger office_lease_settings_audit after insert or update on public.office_lease_settings
for each row execute function public.audit_row_change();
drop trigger if exists office_lease_obligations_audit on public.office_lease_obligations;
create trigger office_lease_obligations_audit after insert or update on public.office_lease_obligations
for each row execute function public.audit_row_change();
drop trigger if exists office_lease_payments_audit on public.office_lease_payments;
create trigger office_lease_payments_audit after insert on public.office_lease_payments
for each row execute function public.audit_row_change();
drop trigger if exists office_lease_documents_audit on public.office_lease_documents;
create trigger office_lease_documents_audit after insert or update on public.office_lease_documents
for each row execute function public.audit_row_change();

create or replace function public.ensure_office_lease_obligations(p_through_month date default current_date)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  configuration public.office_lease_settings%rowtype;
  first_month date;
  last_month date;
  inserted_count integer := 0;
begin
  if not public.can_administer() and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Solo Founder o Administración puede administrar el arriendo.';
  end if;
  select * into configuration from public.office_lease_settings where settings_key='PRIMARY';
  if configuration.id is null then raise exception 'La configuración del arriendo no existe.'; end if;
  first_month := date_trunc('month',coalesce(configuration.contract_start_date,current_date))::date;
  last_month := date_trunc('month',coalesce(p_through_month,current_date))::date;
  if configuration.contract_end_date is not null then
    last_month := least(last_month,date_trunc('month',configuration.contract_end_date)::date);
  end if;
  if last_month < first_month then return 0; end if;
  insert into public.office_lease_obligations(settings_id,period,amount_due,due_date)
  select configuration.id,month_value::date,configuration.monthly_amount,
    (month_value + make_interval(days => configuration.due_day - 1))::date
  from generate_series(first_month,last_month,interval '1 month') month_value
  on conflict(settings_id,period) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.register_office_lease_payment(
  p_obligation_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_payment_method text,
  p_observation text,
  p_proof_path text,
  p_proof_filename text,
  p_proof_mime_type text,
  p_proof_checksum text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  obligation public.office_lease_obligations%rowtype;
  configuration public.office_lease_settings%rowtype;
  existing public.office_lease_payments%rowtype;
  created public.office_lease_payments%rowtype;
  paid_total numeric(14,2);
  remaining numeric(14,2);
  next_receipt integer;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede registrar pagos de arriendo.';
  end if;
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'Falta la clave idempotente.'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'El monto debe ser mayor a cero.'; end if;
  if p_paid_on is null then raise exception 'La fecha de pago es obligatoria.'; end if;
  if nullif(trim(p_payment_method),'') is null then raise exception 'El método de pago es obligatorio.'; end if;
  if nullif(trim(p_proof_path),'') is null or nullif(trim(p_proof_checksum),'') is null then
    raise exception 'El comprobante de pago es obligatorio.';
  end if;

  select * into existing from public.office_lease_payments where idempotency_key=trim(p_idempotency_key);
  if existing.id is not null then
    return jsonb_build_object('id',existing.id,'receiptNumber',existing.receipt_number,'created',false);
  end if;

  select * into obligation from public.office_lease_obligations where id=p_obligation_id for update;
  if obligation.id is null then raise exception 'La obligación mensual no existe.'; end if;
  select * into configuration from public.office_lease_settings where id=obligation.settings_id;
  select coalesce(sum(amount),0) into paid_total from public.office_lease_payments where obligation_id=obligation.id;
  remaining := greatest(obligation.amount_due-paid_total,0);
  if remaining=0 then raise exception 'Este mes ya está pagado.'; end if;
  if p_amount > remaining then
    raise exception 'El pago excede el saldo pendiente ($%).',trim(to_char(remaining,'FM999G999G999G990')) using errcode='23514';
  end if;

  select next_number into next_receipt from public.office_lease_receipt_counter where counter_key='PRIMARY' for update;
  update public.office_lease_receipt_counter set next_number=next_number+1 where counter_key='PRIMARY';
  insert into public.office_lease_payments(
    obligation_id,amount,paid_on,payment_method,observation,receipt_number,idempotency_key,created_by
  ) values (
    obligation.id,p_amount,p_paid_on,trim(p_payment_method),nullif(trim(p_observation),''),next_receipt,trim(p_idempotency_key),actor
  ) returning * into created;

  insert into public.office_lease_documents(
    settings_id,obligation_id,payment_id,document_type,storage_path,original_filename,
    mime_type,checksum,idempotency_key,created_by
  ) values (
    configuration.id,obligation.id,created.id,'PAYMENT_PROOF',trim(p_proof_path),trim(p_proof_filename),
    trim(p_proof_mime_type),trim(p_proof_checksum),'office-rent-proof:'||created.id,actor
  );

  update public.office_lease_obligations
  set status=case when paid_total+p_amount>=amount_due then 'PAID' else 'PENDING' end,updated_at=now()
  where id=obligation.id;
  return jsonb_build_object('id',created.id,'receiptNumber',created.receipt_number,'created',true);
end;
$$;

create or replace function public.attach_office_lease_income_receipt(
  p_payment_id uuid,
  p_storage_path text,
  p_filename text,
  p_checksum text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  payment public.office_lease_payments%rowtype;
  obligation public.office_lease_obligations%rowtype;
  document_id uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  select * into payment from public.office_lease_payments where id=p_payment_id;
  if payment.id is null then raise exception 'Pago de arriendo no encontrado.'; end if;
  select * into obligation from public.office_lease_obligations where id=payment.obligation_id;
  insert into public.office_lease_documents(
    settings_id,obligation_id,payment_id,document_type,storage_path,original_filename,mime_type,
    checksum,idempotency_key,created_by
  ) values (
    obligation.settings_id,obligation.id,payment.id,'INCOME_RECEIPT',trim(p_storage_path),trim(p_filename),
    'application/pdf',trim(p_checksum),'office-rent-receipt:'||payment.id,actor
  ) on conflict(idempotency_key) do update set
    storage_path=excluded.storage_path,original_filename=excluded.original_filename,
    checksum=excluded.checksum,deleted_at=null
  returning id into document_id;
  return document_id;
end;
$$;

create or replace function public.register_office_lease_document(
  p_document_type text,
  p_storage_path text,
  p_filename text,
  p_mime_type text,
  p_checksum text,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare actor uuid:=auth.uid(); configuration_id uuid; document_id uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  if p_document_type not in('CONTRACT','ADDITIONAL') then raise exception 'Tipo documental inválido.'; end if;
  select id into configuration_id from public.office_lease_settings where settings_key='PRIMARY';
  insert into public.office_lease_documents(
    settings_id,document_type,storage_path,original_filename,mime_type,checksum,idempotency_key,created_by
  ) values (
    configuration_id,p_document_type,trim(p_storage_path),trim(p_filename),trim(p_mime_type),
    trim(p_checksum),trim(p_idempotency_key),actor
  ) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning id into document_id;
  return document_id;
end;
$$;

revoke all on function public.ensure_office_lease_obligations(date) from public,anon;
revoke all on function public.register_office_lease_payment(uuid,numeric,date,text,text,text,text,text,text,text) from public,anon;
revoke all on function public.attach_office_lease_income_receipt(uuid,text,text,text) from public,anon;
revoke all on function public.register_office_lease_document(text,text,text,text,text,text) from public,anon;
grant execute on function public.ensure_office_lease_obligations(date) to authenticated,service_role;
grant execute on function public.register_office_lease_payment(uuid,numeric,date,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.attach_office_lease_income_receipt(uuid,text,text,text) to authenticated;
grant execute on function public.register_office_lease_document(text,text,text,text,text,text) to authenticated;

create view public.office_lease_monthly_financials
with (security_invoker=true)
as
select
  o.id as obligation_id,
  o.period,
  o.due_date,
  o.amount_due as contracted_rent,
  coalesce(sum(p.amount),0)::numeric(14,2) as received_amount,
  greatest(o.amount_due-coalesce(sum(p.amount),0),0)::numeric(14,2) as outstanding_amount,
  (s.mortgage_cost+s.common_expenses_cost)::numeric(14,2) as gross_office_cost,
  ((s.mortgage_cost+s.common_expenses_cost)-o.amount_due)::numeric(14,2) as net_contract_cost,
  case
    when coalesce(sum(p.amount),0)>=o.amount_due then 'PAID'
    when o.due_date<current_date then 'OVERDUE'
    else 'PENDING'
  end as effective_status
from public.office_lease_obligations o
join public.office_lease_settings s on s.id=o.settings_id
left join public.office_lease_payments p on p.obligation_id=o.id
group by o.id,o.period,o.due_date,o.amount_due,s.mortgage_cost,s.common_expenses_cost;

revoke all on public.office_lease_monthly_financials from anon,authenticated;
grant select on public.office_lease_monthly_financials to authenticated;

commit;
