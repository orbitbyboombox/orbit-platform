begin;

-- New obligations belong to the event's accounting month, not the month in
-- which an assignment happens to be created. Finalized historical periods are
-- immutable and remain protected by the existing finalized-period guard.
create or replace function public.sync_event_staff_payment_accounting_month()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_month date;
begin
  select date_trunc('month', event_date)::date
    into event_month
  from public.projects
  where id = new.project_id
    and deleted_at is null;

  if event_month is null then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.project_id is distinct from old.project_id
     or new.accounting_month is distinct from old.accounting_month then
    if tg_op = 'UPDATE'
       and exists (
         select 1
         from public.staff_monthly_accounts account
         where account.staff_id = old.staff_id
           and account.accounting_month = old.accounting_month
           and account.settlement_status = 'FINALIZED'
       ) then
      new.accounting_month := old.accounting_month;
    else
      new.accounting_month := event_month;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_event_staff_payment_accounting_month
  on public.event_staff_payments;

create trigger sync_event_staff_payment_accounting_month
before insert or update of project_id, accounting_month
on public.event_staff_payments
for each row
execute function public.sync_event_staff_payment_accounting_month();

-- Repair only active, unpaid, non-finalized rows whose accounting month is
-- unambiguously different from the event month. No amount, payment movement,
-- receipt, or finalized account is modified.
update public.event_staff_payments payment
set accounting_month = date_trunc('month', project.event_date)::date,
    updated_at = now()
from public.projects project
where project.id = payment.project_id
  and project.deleted_at is null
  and payment.deleted_at is null
  and payment.status = 'CONFIRMED'
  and payment.settlement_status <> 'PAID'
  and payment.accounting_month is distinct from date_trunc('month', project.event_date)::date
  and not exists (
    select 1
    from public.staff_monthly_accounts account
    where account.staff_id = payment.staff_id
      and account.accounting_month = payment.accounting_month
      and account.settlement_status = 'FINALIZED'
  );

commit;
