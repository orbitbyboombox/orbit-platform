begin;

-- Settlement accounting periods are assigned by the canonical payment record.
-- Recalculating paid amounts must never infer or rewrite that period.
create or replace function public.recalculate_event_staff_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  total_paid numeric(14,2);
  last_paid date;
  payroll_amount numeric(14,2);
begin
  select
    coalesce(sum(case when movement_type='REVERSAL' then -amount else amount end),0),
    max(movement_date) filter(where movement_type in('ADVANCE','PAYMENT'))
  into total_paid,last_paid
  from public.event_staff_settlement_movements
  where settlement_id=p_settlement_id and deleted_at is null;

  select coalesce(public.staff_settlement_payroll_amount(p_settlement_id),0)
    into payroll_amount;

  if not exists(
    select 1 from public.event_staff_payments
    where id=p_settlement_id and deleted_at is null
  ) then return; end if;

  update public.event_staff_payments
  set paid_amount=greatest(total_paid,0),
      paid_at=case when total_paid>0 then last_paid else null end,
      settlement_status=case
        when total_paid<=0 then 'PENDING'
        when total_paid>=payroll_amount then 'PAID'
        else 'ADVANCE'
      end,
      updated_at=now(),
      updated_by=coalesce(auth.uid(),updated_by)
  where id=p_settlement_id;
end;
$$;

-- A finalized snapshot is an immutable period boundary. The only exception is
-- an explicit, audited override carrying a reason in the transaction-local
-- settings used by the Founder/Admin override action or this repair migration.
create or replace function public.guard_finalized_settlement_period_change()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  finalized_account public.staff_monthly_accounts%rowtype;
  override_enabled boolean:=current_setting('orbit.period_override',true)='on';
  override_reason text:=nullif(trim(current_setting('orbit.period_override_reason',true)),'');
  authorized boolean:=override_enabled and override_reason is not null and (
    public.can_administer()
    or current_user in ('postgres','supabase_admin')
  );
begin
  if tg_op='UPDATE'
    and old.accounting_month is distinct from new.accounting_month
  then
    select account.* into finalized_account
    from public.staff_monthly_accounts account
    where account.settlement_status='FINALIZED'
      and account.staff_id=old.staff_id
      and exists(
        select 1
        from jsonb_array_elements(coalesce(account.finalized_snapshot->'details','[]'::jsonb)) detail
        where detail->>'settlementId'=old.id::text
      )
    order by account.updated_at desc
    limit 1;

    if finalized_account.id is not null and not authorized then
      raise exception 'El período de un settlement finalizado es inmutable; requiere override administrativo auditado.'
        using errcode='42501';
    end if;

    if finalized_account.id is not null and authorized then
      insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,reason,state)
      values(
        finalized_account.id,
        'REFRESHED',
        auth.uid(),
        override_reason,
        jsonb_build_object(
          'settlementId',old.id,
          'from',old.accounting_month,
          'to',new.accounting_month,
          'staffId',old.staff_id,
          'explicitOverride',true
        )
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_finalized_settlement_period_change on public.event_staff_payments;
create trigger guard_finalized_settlement_period_change
before update of accounting_month on public.event_staff_payments
for each row execute function public.guard_finalized_settlement_period_change();

-- Repair every cross-period case from the finalized snapshot, not only the
-- currently reported four records. Abort if history is internally ambiguous.
do $$
declare
  ambiguous_count integer;
begin
  select count(*) into ambiguous_count
  from (
    select detail->>'settlementId' settlement_id
    from public.staff_monthly_accounts account
    cross join lateral jsonb_array_elements(coalesce(account.finalized_snapshot->'details','[]'::jsonb)) detail
    where account.settlement_status='FINALIZED'
      and detail->>'settlementId' is not null
    group by detail->>'settlementId'
    having count(distinct account.accounting_month)>1
  ) ambiguous;
  if ambiguous_count>0 then
    raise exception 'No se puede reparar períodos: existen snapshots finalizados ambiguos.';
  end if;
end;
$$;

select set_config('orbit.period_override','on',true);
select set_config('orbit.period_override_reason','Reparación controlada: restaurar accounting_month al período FINALIZED del snapshot canónico.',true);

with finalized_period as (
  select detail->>'settlementId' settlement_id,min(account.accounting_month) finalized_month
  from public.staff_monthly_accounts account
  cross join lateral jsonb_array_elements(coalesce(account.finalized_snapshot->'details','[]'::jsonb)) detail
  where account.settlement_status='FINALIZED'
    and detail->>'settlementId' is not null
  group by detail->>'settlementId'
)
update public.event_staff_payments payment
set accounting_month=finalized_period.finalized_month,
    updated_at=now(),
    updated_by=coalesce(auth.uid(),updated_by)
from finalized_period
where payment.id=finalized_period.settlement_id::uuid
  and payment.accounting_month is distinct from finalized_period.finalized_month;

select set_config('orbit.period_override','off',true);
select set_config('orbit.period_override_reason','',true);

-- Refresh only open/DRAFT September projections after the repair. Finalized
-- accounts and their snapshots are not recalculated or rewritten.
do $$
declare item record;
begin
  for item in
    select staff_id,accounting_month
    from public.staff_monthly_accounts
    where accounting_month='2026-09-01'::date
      and settlement_status<>'FINALIZED'
  loop
    perform public.ensure_staff_monthly_account(item.staff_id,item.accounting_month);
  end loop;
end;
$$;

commit;
