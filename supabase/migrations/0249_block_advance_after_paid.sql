-- Keep Staff advances available after Event completion, but fail closed once
-- the monthly account has been paid. This protects every writer, not only UI.
create or replace function public.block_staff_advance_after_paid()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.movement_type = 'ADVANCE'
     and exists (
       select 1
       from public.event_staff_payments payment
       join public.projects project on project.id = payment.project_id
       join public.staff_monthly_accounts account
         on account.staff_id = payment.staff_id
        and account.accounting_month = date_trunc('month', project.event_date)::date
       where payment.id = new.settlement_id
         and account.payment_status = 'PAID'
     ) then
    raise exception 'La cuenta mensual ya está pagada.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists staff_advance_paid_gate on public.event_staff_settlement_movements;
create trigger staff_advance_paid_gate
before insert on public.event_staff_settlement_movements
for each row execute function public.block_staff_advance_after_paid();
