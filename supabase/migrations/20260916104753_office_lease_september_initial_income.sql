begin;

-- A receipt can settle recurring rent and contain non-recurring income without
-- turning that income into a monthly obligation. The payment remains the cash
-- receipt header while these immutable lines are the accounting classification.
create table public.office_lease_income_items (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.office_lease_payments(id) on delete restrict,
  obligation_id uuid not null references public.office_lease_obligations(id) on delete restrict,
  item_type text not null check (item_type in ('RENT','SECURITY_DEPOSIT')),
  description text not null check (length(trim(description)) > 0),
  detail text,
  period_start date,
  period_end date,
  amount numeric(14,2) not null check (amount > 0),
  sort_order smallint not null default 1 check (sort_order > 0),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create index office_lease_income_items_obligation_idx
  on public.office_lease_income_items(obligation_id,item_type,created_at);
create index office_lease_income_items_payment_idx
  on public.office_lease_income_items(payment_id,sort_order);

alter table public.office_lease_income_items enable row level security;
revoke all on table public.office_lease_income_items from anon,authenticated;
grant select on table public.office_lease_income_items to authenticated;
create policy office_lease_income_items_admin_select
  on public.office_lease_income_items for select to authenticated
  using (public.can_administer());

drop trigger if exists office_lease_income_items_audit on public.office_lease_income_items;
create trigger office_lease_income_items_audit after insert on public.office_lease_income_items
for each row execute function public.audit_row_change();

-- Preserve compatibility if a payment was registered between the original
-- module launch and this correction: historical payment amounts are rent.
insert into public.office_lease_income_items(
  payment_id,obligation_id,item_type,description,detail,period_start,period_end,
  amount,sort_order,idempotency_key
)
select
  p.id,p.obligation_id,'RENT',s.concept,to_char(o.period,'TMMonth YYYY'),
  o.period,(o.period + interval '1 month - 1 day')::date,p.amount,1,
  'office-rent:legacy-payment:'||p.id||':rent'
from public.office_lease_payments p
join public.office_lease_obligations o on o.id=p.obligation_id
join public.office_lease_settings s on s.id=o.settings_id
where p.idempotency_key<>'office-rent:2026-09:initial-income'
on conflict(idempotency_key) do nothing;

-- September 2026 was the initial, partial period. Reconcile it atomically and
-- reserve receipt N°001 for the actual two-line receipt supplied by Founder.
do $$
declare
  september_obligation public.office_lease_obligations%rowtype;
  initial_payment public.office_lease_payments%rowtype;
  actor_id uuid;
  conflicting_receipt uuid;
begin
  select o.* into september_obligation
  from public.office_lease_obligations o
  join public.office_lease_settings s on s.id=o.settings_id
  where s.settings_key='PRIMARY' and o.period=date '2026-09-01'
  for update;
  if september_obligation.id is null then
    raise exception 'No existe la obligación canónica de septiembre 2026.';
  end if;

  select id into actor_id
  from public.profiles
  where role in ('CEO','ADMINISTRATOR')
  order by case when role='CEO' then 0 else 1 end,id
  limit 1;
  if actor_id is null then raise exception 'No existe actor Founder/Admin para reconciliar septiembre.'; end if;

  select id into conflicting_receipt
  from public.office_lease_payments
  where receipt_number=1 and idempotency_key<>'office-rent:2026-09:initial-income';
  if conflicting_receipt is not null then
    raise exception 'El recibo N°001 ya pertenece a otro pago (%).',conflicting_receipt;
  end if;

  update public.office_lease_obligations
  set amount_due=240000,status='PAID',updated_at=now()
  where id=september_obligation.id;

  insert into public.office_lease_obligations(settings_id,period,amount_due,due_date,status)
  select s.id,date '2026-10-01',s.monthly_amount,
    (date '2026-10-01' + make_interval(days => s.due_day - 1))::date,'PENDING'
  from public.office_lease_settings s
  where s.id=september_obligation.settings_id
  on conflict(settings_id,period) do nothing;

  select * into initial_payment
  from public.office_lease_payments
  where idempotency_key='office-rent:2026-09:initial-income';

  if initial_payment.id is null then
    insert into public.office_lease_payments(
      obligation_id,amount,paid_on,payment_method,observation,receipt_number,
      idempotency_key,created_by
    ) values (
      september_obligation.id,690000,date '2026-09-15','NO INFORMADO',
      'Ingreso inicial septiembre 2026: mes de garantía y arriendo proporcional del 15 al 30.',
      1,'office-rent:2026-09:initial-income',actor_id
    ) returning * into initial_payment;
  else
    update public.office_lease_payments
    set obligation_id=september_obligation.id,amount=690000,paid_on=date '2026-09-15',
        payment_method='NO INFORMADO',receipt_number=1,
        observation='Ingreso inicial septiembre 2026: mes de garantía y arriendo proporcional del 15 al 30.'
    where id=initial_payment.id
    returning * into initial_payment;
  end if;

  delete from public.office_lease_income_items
  where payment_id=initial_payment.id
    and (
      idempotency_key like 'office-rent:2026-09:initial-income:%'
      or idempotency_key='office-rent:legacy-payment:'||initial_payment.id||':rent'
    );

  insert into public.office_lease_income_items(
    payment_id,obligation_id,item_type,description,detail,period_start,period_end,
    amount,sort_order,idempotency_key
  ) values
    (initial_payment.id,september_obligation.id,'SECURITY_DEPOSIT','Mes de garantía',
     'Garantía asociada al contrato de arrendamiento',null,null,450000,1,
     'office-rent:2026-09:initial-income:security-deposit'),
    (initial_payment.id,september_obligation.id,'RENT','Arriendo proporcional septiembre 15 al 30',
     'Septiembre 2026 · periodo 15 al 30',date '2026-09-15',date '2026-09-30',240000,2,
     'office-rent:2026-09:initial-income:rent');

  update public.office_lease_receipt_counter
  set next_number=greatest(next_number,2)
  where counter_key='PRIMARY';
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
  select coalesce(sum(item.amount),0) into paid_total
  from public.office_lease_income_items item
  where item.obligation_id=obligation.id and item.item_type='RENT';
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

  insert into public.office_lease_income_items(
    payment_id,obligation_id,item_type,description,detail,period_start,period_end,
    amount,sort_order,idempotency_key
  ) values (
    created.id,obligation.id,'RENT',configuration.concept,
    to_char(obligation.period,'TMMonth YYYY'),obligation.period,
    (obligation.period + interval '1 month - 1 day')::date,p_amount,1,
    'office-rent-payment:'||created.id||':rent'
  );

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

revoke all on function public.register_office_lease_payment(uuid,numeric,date,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_office_lease_payment(uuid,numeric,date,text,text,text,text,text,text,text) to authenticated;

drop view if exists public.office_lease_monthly_financials;
create view public.office_lease_monthly_financials
with (security_invoker=true)
as
with classified as (
  select
    item.obligation_id,
    coalesce(sum(item.amount) filter(where item.item_type='RENT'),0)::numeric(14,2) as received_amount,
    coalesce(sum(item.amount) filter(where item.item_type='SECURITY_DEPOSIT'),0)::numeric(14,2) as guarantee_amount,
    coalesce(sum(item.amount),0)::numeric(14,2) as cash_received_amount
  from public.office_lease_income_items item
  group by item.obligation_id
)
select
  o.id as obligation_id,
  o.period,
  o.due_date,
  o.amount_due as contracted_rent,
  coalesce(c.received_amount,0)::numeric(14,2) as received_amount,
  coalesce(c.guarantee_amount,0)::numeric(14,2) as guarantee_amount,
  coalesce(c.cash_received_amount,0)::numeric(14,2) as cash_received_amount,
  greatest(o.amount_due-coalesce(c.received_amount,0),0)::numeric(14,2) as outstanding_amount,
  (s.mortgage_cost+s.common_expenses_cost)::numeric(14,2) as gross_office_cost,
  ((s.mortgage_cost+s.common_expenses_cost)-s.monthly_amount)::numeric(14,2) as net_recurrent_cost,
  case
    when coalesce(c.received_amount,0)>=o.amount_due then 'PAID'
    when o.due_date<current_date then 'OVERDUE'
    else 'PENDING'
  end as effective_status
from public.office_lease_obligations o
join public.office_lease_settings s on s.id=o.settings_id
left join classified c on c.obligation_id=o.id;

revoke all on public.office_lease_monthly_financials from anon,authenticated;
grant select on public.office_lease_monthly_financials to authenticated;

commit;
