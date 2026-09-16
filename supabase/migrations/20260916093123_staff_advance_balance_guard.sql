begin;

-- Serialize every advance against its canonical Event + Staff settlement and
-- reject any movement that would create an accidental credit balance.
create or replace function public.guard_staff_advance_balance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  settlement public.event_staff_payments%rowtype;
  obligation numeric(14,2);
  already_paid numeric(14,2);
  available numeric(14,2);
begin
  if new.movement_type <> 'ADVANCE' or new.deleted_at is not null then
    return new;
  end if;

  select * into settlement
  from public.event_staff_payments
  where id = new.settlement_id
    and status = 'CONFIRMED'
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Liquidación Staff confirmada no encontrada.';
  end if;

  obligation := coalesce(public.staff_settlement_final_amount(settlement.id), 0);
  select coalesce(sum(case when movement_type='REVERSAL' then -amount else amount end),0)
  into already_paid
  from public.event_staff_settlement_movements
  where settlement_id=settlement.id and deleted_at is null;
  available := greatest(obligation - already_paid, 0);

  if new.amount > available then
    raise exception 'El adelanto excede el saldo disponible de la liquidación ($%).',
      trim(to_char(available,'FM999G999G999G990')) using errcode='23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_staff_advance_balance() from public,anon,authenticated;
drop trigger if exists staff_advance_balance_guard on public.event_staff_settlement_movements;
create trigger staff_advance_balance_guard
before insert on public.event_staff_settlement_movements
for each row
when (new.movement_type='ADVANCE')
execute function public.guard_staff_advance_balance();

commit;
