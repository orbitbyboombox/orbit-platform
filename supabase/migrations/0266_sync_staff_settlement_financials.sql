begin;

-- Pending, unpaid settlements must reflect the current consolidated payment
-- row. Once money has moved or the period is finalized, the captured snapshot
-- remains immutable and formal adjustments are the only change path.
create or replace function public.staff_settlement_original_net(p_settlement public.event_staff_payments)
returns numeric language sql immutable as $$
  select case
    when coalesce(p_settlement.paid_amount,0)=0 and p_settlement.settlement_status='PENDING'
      then coalesce(p_settlement.total_internal_payment,0)
    else coalesce(p_settlement.original_operator_payment,p_settlement.automatic_operator_payment,p_settlement.operator_payment,0)
      + coalesce(p_settlement.original_assembly_payment,p_settlement.automatic_assembly_payment,p_settlement.assembly_payment,0)
      + coalesce(p_settlement.original_disassembly_payment,p_settlement.automatic_disassembly_payment,p_settlement.disassembly_payment,0)
  end
$$;

drop view if exists public.staff_monthly_payroll;
drop view if exists public.staff_worked_events;
drop view if exists public.staff_settlement_financials;

create view public.staff_settlement_financials with(security_invoker=true) as
select settlement.id settlement_id,settlement.staff_id,settlement.project_id,settlement.accounting_month,
  case when coalesce(settlement.paid_amount,0)=0 and settlement.settlement_status='PENDING' then coalesce(settlement.operator_payment,0) else coalesce(settlement.original_operator_payment,settlement.automatic_operator_payment,settlement.operator_payment,0) end original_operator,
  case when coalesce(settlement.paid_amount,0)=0 and settlement.settlement_status='PENDING' then coalesce(settlement.assembly_payment,0) else coalesce(settlement.original_assembly_payment,settlement.automatic_assembly_payment,settlement.assembly_payment,0) end original_assembly,
  case when coalesce(settlement.paid_amount,0)=0 and settlement.settlement_status='PENDING' then coalesce(settlement.disassembly_payment,0) else coalesce(settlement.original_disassembly_payment,settlement.automatic_disassembly_payment,settlement.disassembly_payment,0) end original_disassembly,
  public.staff_settlement_original_net(settlement) original_net,
  coalesce(adjustment.total,0) adjustment_total,coalesce(reimbursement.total,0) reimbursement_total,
  public.staff_settlement_original_net(settlement)+coalesce(adjustment.total,0) payroll_net,
  public.staff_settlement_original_net(settlement)+coalesce(adjustment.total,0)+coalesce(reimbursement.total,0) final_amount,
  settlement.paid_amount,greatest(public.staff_settlement_original_net(settlement)+coalesce(adjustment.total,0)+coalesce(reimbursement.total,0)-settlement.paid_amount,0) remaining_balance,
  greatest(settlement.paid_amount-(public.staff_settlement_original_net(settlement)+coalesce(adjustment.total,0)+coalesce(reimbursement.total,0)),0) credit_balance,
  settlement.settlement_status,settlement.sii_receipt_status
from public.event_staff_payments settlement
left join lateral(select sum(amount) total from public.event_staff_settlement_adjustments where settlement_id=settlement.id) adjustment on true
left join lateral(select sum(total) total from public.expenses where event_staff_settlement_id=settlement.id and deleted_at is null and status<>'CANCELLED') reimbursement on true
where settlement.deleted_at is null and settlement.status='CONFIRMED';

create view public.staff_worked_events with(security_invoker=true) as
select financial.settlement_id,financial.staff_id,financial.project_id,project.event_date,project.name event_name,customer.full_name customer,
  coalesce((select string_agg(service.service_code,' + ' order by service.service_code) from public.project_services service where service.project_id=project.id),project.project_type) service,
  settlement.tasks roles,financial.original_net generated_net,financial.adjustment_total,financial.reimbursement_total,financial.payroll_net,financial.final_amount,
  financial.paid_amount,financial.remaining_balance,financial.credit_balance,financial.settlement_status,financial.sii_receipt_status,financial.accounting_month
from public.staff_settlement_financials financial join public.event_staff_payments settlement on settlement.id=financial.settlement_id
join public.projects project on project.id=financial.project_id join public.customers customer on customer.id=project.customer_id;

create view public.staff_monthly_payroll with(security_invoker=true) as
select staff_id,accounting_month,count(*) events_worked,sum(generated_net) original_net,sum(adjustment_total) adjustment_total,sum(reimbursement_total) reimbursement_total,sum(payroll_net) payroll_net,sum(final_amount) final_amount,sum(paid_amount) paid_amount,sum(remaining_balance) remaining_balance,sum(credit_balance) credit_balance,count(*) filter(where sii_receipt_status='PENDING') receipt_pending,count(*) filter(where sii_receipt_status='RECEIVED') receipt_received
from public.staff_worked_events group by staff_id,accounting_month;

grant select on public.staff_settlement_financials,public.staff_worked_events,public.staff_monthly_payroll to authenticated;
commit;
