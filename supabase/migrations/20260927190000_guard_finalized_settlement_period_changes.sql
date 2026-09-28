begin;

create or replace function public.guard_finalized_settlement_period_change()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  finalized_account public.staff_monthly_accounts%rowtype;
begin
  if tg_op='UPDATE'
    and old.accounting_month is distinct from new.accounting_month
    and old.accounting_month is not null
  then
    select * into finalized_account
    from public.staff_monthly_accounts account
    where account.staff_id=old.staff_id
      and account.accounting_month=old.accounting_month
      and account.settlement_status='FINALIZED'
    order by account.updated_at desc
    limit 1;

    if finalized_account.id is not null
      and coalesce(current_setting('request.jwt.claim.role',true),'') not in ('service_role')
      and current_user not in ('postgres','supabase_admin')
      and not public.can_administer()
    then
      raise exception 'No se puede mover una liquidación fuera de un período finalizado sin autorización administrativa.'
        using errcode='42501';
    end if;

    if finalized_account.id is not null then
      insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,reason,state)
      values(
        finalized_account.id,
        'REFRESHED',
        auth.uid(),
        format('Cambio autorizado de período para settlement %s: %s → %s.',old.id,old.accounting_month,new.accounting_month),
        jsonb_build_object('settlementId',old.id,'from',old.accounting_month,'to',new.accounting_month,'staffId',old.staff_id)
      );
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists guard_finalized_settlement_period_change on public.event_staff_payments;
create trigger guard_finalized_settlement_period_change
before update of accounting_month on public.event_staff_payments
for each row execute function public.guard_finalized_settlement_period_change();

comment on function public.guard_finalized_settlement_period_change() is
  'Prevents moving settlements out of finalized monthly periods without an administrative override and records authorized overrides.';

commit;
