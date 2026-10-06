begin;

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
         where account.settlement_status = 'FINALIZED'
           and account.staff_id = old.staff_id
           and exists (
             select 1
             from jsonb_array_elements(coalesce(account.finalized_snapshot->'details', '[]'::jsonb)) detail
             where detail->>'settlementId' = old.id::text
           )
       ) then
      new.accounting_month := old.accounting_month;
    else
      new.accounting_month := event_month;
    end if;
  end if;

  return new;
end;
$$;

update public.event_staff_payments payment
set accounting_month = date_trunc('month', project.event_date)::date,
    updated_at = now()
from public.projects project
where project.id = payment.project_id
  and payment.deleted_at is null
  and payment.status = 'CONFIRMED'
  and payment.settlement_status <> 'PAID'
  and payment.accounting_month is distinct from date_trunc('month', project.event_date)::date
  and not exists (
    select 1
    from public.staff_monthly_accounts account
    where account.settlement_status = 'FINALIZED'
      and account.staff_id = payment.staff_id
      and exists (
        select 1
        from jsonb_array_elements(coalesce(account.finalized_snapshot->'details', '[]'::jsonb)) detail
        where detail->>'settlementId' = payment.id::text
      )
  );

commit;
