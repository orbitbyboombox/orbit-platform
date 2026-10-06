begin;

create or replace function public.staff_settlement_final_amount(p_settlement_id uuid)
returns numeric language sql stable security invoker set search_path=public as $$
  select public.staff_settlement_payable_net(settlement)
    + coalesce((select sum(adjustment.amount) from public.event_staff_settlement_adjustments adjustment where adjustment.settlement_id=settlement.id),0)
    + coalesce((select sum(expense.total) from public.expenses expense where expense.event_staff_settlement_id=settlement.id and expense.deleted_at is null and expense.status<>'CANCELLED'),0)
  from public.event_staff_payments settlement
  where settlement.id=p_settlement_id and settlement.deleted_at is null
$$;

commit;
