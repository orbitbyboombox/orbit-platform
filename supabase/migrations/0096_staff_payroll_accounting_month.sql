begin;

-- Payroll belongs to the settlement/payment accounting period. The Event date
-- remains historical context and must never decide the payroll month.
alter table public.event_staff_payments
  alter column accounting_month set default
  date_trunc('month', timezone('America/Santiago', now()))::date;

create or replace function public.recalculate_event_staff_settlement(p_settlement_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  total_paid numeric(14,2);
  last_paid date;
  net numeric(14,2);
  settlement_created_at timestamptz;
  settlement_accounting_month date;
begin
  select
    coalesce(sum(case when movement_type='REVERSAL' then -amount else amount end),0),
    max(movement_date) filter(where movement_type in('ADVANCE','PAYMENT'))
  into total_paid,last_paid
  from public.event_staff_settlement_movements
  where settlement_id=p_settlement_id and deleted_at is null;

  select total_internal_payment,created_at
  into net,settlement_created_at
  from public.event_staff_payments
  where id=p_settlement_id and deleted_at is null;

  if net is null then return;end if;

  settlement_accounting_month:=date_trunc(
    'month',
    coalesce(last_paid,timezone('America/Santiago',settlement_created_at)::date)
  )::date;

  update public.event_staff_payments
  set paid_amount=greatest(total_paid,0),
    paid_at=case when total_paid>0 then last_paid else null end,
    accounting_month=settlement_accounting_month,
    settlement_status=case when total_paid<=0 then 'PENDING' when total_paid>=net then 'PAID' else 'ADVANCE' end,
    updated_at=now(),
    updated_by=coalesce(auth.uid(),updated_by)
  where id=p_settlement_id;
end $$;

-- Reclassify existing canonical settlements using their payment movements.
do $$
declare item record;
begin
  for item in select id from public.event_staff_payments where deleted_at is null loop
    perform public.recalculate_event_staff_settlement(item.id);
  end loop;
end $$;

comment on column public.event_staff_payments.accounting_month is
  'Mes contable de nómina: mes del último anticipo/pago; sin movimientos, mes de creación de la liquidación. Nunca deriva de la fecha del Evento.';

commit;
