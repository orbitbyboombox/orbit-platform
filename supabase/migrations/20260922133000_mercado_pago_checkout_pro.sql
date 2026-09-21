begin;

-- Checkout Pro attempts are payment intents, not a second ledger.  The
-- canonical customer payment ledger remains invoice_payments; this table
-- only holds the provider checkout correlation until a webhook is verified.
create table if not exists public.mercado_pago_payment_intents (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  external_reference text not null unique,
  project_id uuid references public.projects(id),
  quotation_id uuid references public.quotations(id),
  reservation_id uuid,
  amount_base numeric(14,2) not null check (amount_base > 0),
  fee_amount numeric(14,2) not null default 0 check (fee_amount >= 0),
  amount_total numeric(14,2) not null check (amount_total > 0),
  currency text not null default 'CLP',
  status text not null default 'CREATED' check (status in ('CREATED','PENDING','PAID','FAILED','REVIEW_REQUIRED','REFUNDED','CHARGEBACK')),
  provider_preference_id text,
  checkout_url text,
  provider_payment_id text,
  submission jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  failure_reason text,
  booking_completed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mercado_pago_intents_provider_payment_uq
  on public.mercado_pago_payment_intents(provider_payment_id)
  where provider_payment_id is not null;
create index if not exists mercado_pago_intents_token_idx
  on public.mercado_pago_payment_intents(token_hash, created_at desc);

alter table public.mercado_pago_payment_intents enable row level security;
revoke all on public.mercado_pago_payment_intents from anon, authenticated;

comment on table public.mercado_pago_payment_intents is
  'Checkout Pro correlation only; verified customer payments are written to invoice_payments.';

create or replace function public.register_automatic_booking_mercado_pago_deposit(
  p_project_id uuid,
  p_actor_id uuid,
  p_provider_payment_id text,
  p_external_reference text,
  p_method text default 'MERCADO_PAGO'
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  project public.projects%rowtype;
  invoice public.invoices%rowtype;
  quote public.quotations%rowtype;
  payment_id uuid;
  deposit_amount numeric;
  stable_key text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Solo el pipeline seguro puede registrar este abono.'; end if;
  if nullif(trim(coalesce(p_provider_payment_id,'')),'') is null then raise exception 'Falta identificador de pago Mercado Pago.'; end if;
  select * into project from public.projects where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  if upper(coalesce(project.operations->>'reservationMethod','')) <> 'AUTOMATIC' then raise exception 'El evento no pertenece al flujo automático.'; end if;
  select * into invoice from public.invoices where project_id=project.id and deleted_at is null and financial_record_state='ACTIVE' and record_origin='PRODUCTION' order by created_at desc limit 1 for update;
  if not found then raise exception 'La reserva automática no tiene cuenta por cobrar activa.'; end if;
  select * into quote from public.quotations where project_id=project.id and deleted_at is null order by case when status='ACCEPTED' then 0 else 1 end,created_at desc limit 1;
  if not found then raise exception 'La reserva automática no tiene cotización canónica.'; end if;
  stable_key:='automatic-booking-mercadopago|'||p_provider_payment_id;
  select id into payment_id from public.invoice_payments where invoice_id=invoice.id and idempotency_key=stable_key and deleted_at is null limit 1;
  if payment_id is null then
    deposit_amount:=round(coalesce(quote.final_customer_price,quote.grand_total,invoice.amount,0)*coalesce(quote.deposit_percent,50)/100);
    if deposit_amount<=0 or deposit_amount>coalesce(invoice.amount,0) then raise exception 'El abono canónico no es válido.'; end if;
    perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,true);
    payment_id:=public.apply_receivable_movement(
      p_invoice_id=>invoice.id,p_action=>'DEPOSIT',p_amount=>deposit_amount,p_occurred_at=>now(),
      p_method=>coalesce(nullif(trim(p_method),''),'MERCADO_PAGO'),p_receipt_path=>null,p_receipt_checksum=>null,
      p_reason=>'Abono verificado por Mercado Pago',p_idempotency_key=>stable_key);
    update public.invoice_payments set reference=p_provider_payment_id||'|'||coalesce(p_external_reference,'') where id=payment_id;
  end if;
  return jsonb_build_object('paymentId',payment_id,'invoiceId',invoice.id,'amount',coalesce((select amount from public.invoice_payments where id=payment_id),0),'idempotencyKey',stable_key);
end $$;
revoke all on function public.register_automatic_booking_mercado_pago_deposit(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.register_automatic_booking_mercado_pago_deposit(uuid,uuid,text,text,text) to service_role;

commit;
