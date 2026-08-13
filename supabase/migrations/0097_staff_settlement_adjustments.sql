begin;

alter table public.event_staff_payments
  add column if not exists original_operator_payment numeric(14,2),
  add column if not exists original_assembly_payment numeric(14,2),
  add column if not exists original_disassembly_payment numeric(14,2);
update public.event_staff_payments set
  original_operator_payment=coalesce(original_operator_payment,automatic_operator_payment,operator_payment),
  original_assembly_payment=coalesce(original_assembly_payment,automatic_assembly_payment,assembly_payment),
  original_disassembly_payment=coalesce(original_disassembly_payment,automatic_disassembly_payment,disassembly_payment)
where status='CONFIRMED';

create or replace function public.capture_event_staff_settlement_original()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='CONFIRMED' then
    new.original_operator_payment:=coalesce(case when tg_op='UPDATE' then old.original_operator_payment end,new.original_operator_payment,new.automatic_operator_payment,new.operator_payment);
    new.original_assembly_payment:=coalesce(case when tg_op='UPDATE' then old.original_assembly_payment end,new.original_assembly_payment,new.automatic_assembly_payment,new.assembly_payment);
    new.original_disassembly_payment:=coalesce(case when tg_op='UPDATE' then old.original_disassembly_payment end,new.original_disassembly_payment,new.automatic_disassembly_payment,new.disassembly_payment);
  end if;
  return new;
end $$;
drop trigger if exists capture_event_staff_settlement_original on public.event_staff_payments;
create trigger capture_event_staff_settlement_original before insert or update on public.event_staff_payments
for each row execute function public.capture_event_staff_settlement_original();

create table if not exists public.event_staff_settlement_adjustments(
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.event_staff_payments(id),
  reason text not null check(reason in('BONUS','EXTRA_HOURS','OPERATIONAL_AGREEMENT','CUSTOMER_REQUEST','DIFFERENCE_CORRECTION','OTHER')),
  amount numeric(14,2) not null check(amount<>0),
  comment text not null check(length(trim(comment))>=3),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists event_staff_settlement_adjustments_settlement_idx
  on public.event_staff_settlement_adjustments(settlement_id,created_at);

alter table public.event_staff_settlement_adjustments enable row level security;
drop policy if exists event_staff_settlement_adjustments_internal_read on public.event_staff_settlement_adjustments;
create policy event_staff_settlement_adjustments_internal_read on public.event_staff_settlement_adjustments for select using(public.is_internal_user());
drop policy if exists event_staff_settlement_adjustments_admin_insert on public.event_staff_settlement_adjustments;
create policy event_staff_settlement_adjustments_admin_insert on public.event_staff_settlement_adjustments for insert with check(public.can_administer() and created_by=auth.uid());
revoke update,delete on public.event_staff_settlement_adjustments from authenticated;

create or replace function public.staff_settlement_original_net(p_settlement public.event_staff_payments)
returns numeric language sql immutable as $$
  select coalesce(p_settlement.original_operator_payment,p_settlement.automatic_operator_payment,p_settlement.operator_payment,0)
    +coalesce(p_settlement.original_assembly_payment,p_settlement.automatic_assembly_payment,p_settlement.assembly_payment,0)
    +coalesce(p_settlement.original_disassembly_payment,p_settlement.automatic_disassembly_payment,p_settlement.disassembly_payment,0)
$$;

create or replace function public.staff_settlement_final_amount(p_settlement_id uuid)
returns numeric language sql stable security invoker set search_path=public as $$
  select public.staff_settlement_original_net(settlement)
    +coalesce((select sum(adjustment.amount) from public.event_staff_settlement_adjustments adjustment where adjustment.settlement_id=settlement.id),0)
    +coalesce((select sum(expense.total) from public.expenses expense where expense.event_staff_settlement_id=settlement.id and expense.deleted_at is null and expense.status<>'CANCELLED'),0)
  from public.event_staff_payments settlement
  where settlement.id=p_settlement_id and settlement.deleted_at is null
$$;

create or replace function public.recalculate_event_staff_settlement(p_settlement_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  total_paid numeric(14,2);
  last_paid date;
  final_amount numeric(14,2);
  settlement_created_at timestamptz;
  settlement_accounting_month date;
begin
  select coalesce(sum(case when movement_type='REVERSAL' then -amount else amount end),0),
    max(movement_date) filter(where movement_type in('ADVANCE','PAYMENT'))
  into total_paid,last_paid
  from public.event_staff_settlement_movements
  where settlement_id=p_settlement_id and deleted_at is null;

  select created_at into settlement_created_at from public.event_staff_payments
  where id=p_settlement_id and deleted_at is null;
  if settlement_created_at is null then return;end if;

  final_amount:=coalesce(public.staff_settlement_final_amount(p_settlement_id),0);
  settlement_accounting_month:=date_trunc('month',coalesce(last_paid,timezone('America/Santiago',settlement_created_at)::date))::date;
  update public.event_staff_payments
  set paid_amount=greatest(total_paid,0),paid_at=case when total_paid>0 then last_paid else null end,
    accounting_month=settlement_accounting_month,
    settlement_status=case when total_paid<=0 then 'PENDING' when total_paid>=final_amount then 'PAID' else 'ADVANCE' end,
    updated_at=now(),updated_by=coalesce(auth.uid(),updated_by)
  where id=p_settlement_id;
end $$;

create or replace function public.add_staff_settlement_adjustment(p_settlement_id uuid,p_reason text,p_amount numeric,p_comment text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede registrar ajustes.';end if;
  if p_reason not in('BONUS','EXTRA_HOURS','OPERATIONAL_AGREEMENT','CUSTOMER_REQUEST','DIFFERENCE_CORRECTION','OTHER') then raise exception 'Motivo de ajuste inválido.';end if;
  if coalesce(p_amount,0)=0 or length(trim(coalesce(p_comment,'')))<3 then raise exception 'Ingresa un monto distinto de cero y un comentario.';end if;
  if not exists(select 1 from public.event_staff_payments where id=p_settlement_id and deleted_at is null and status='CONFIRMED') then raise exception 'Liquidación confirmada no encontrada.';end if;
  insert into public.event_staff_settlement_adjustments(settlement_id,reason,amount,comment,created_by)
  values(p_settlement_id,p_reason,p_amount,trim(p_comment),auth.uid()) returning id into result;
  return result;
end $$;
grant execute on function public.add_staff_settlement_adjustment(uuid,text,numeric,text) to authenticated;

create or replace function public.event_staff_adjustment_changed()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.recalculate_event_staff_settlement(new.settlement_id);return new;end $$;
drop trigger if exists event_staff_adjustment_sync on public.event_staff_settlement_adjustments;
create trigger event_staff_adjustment_sync after insert on public.event_staff_settlement_adjustments
for each row execute function public.event_staff_adjustment_changed();

-- Compatibility entry point: legacy callers now create an immutable difference
-- adjustment instead of overwriting generated role values.
create or replace function public.set_staff_payment_override(p_payment_id uuid,p_operator numeric,p_assembly numeric,p_disassembly numeric,p_reason text)
returns void language plpgsql security invoker set search_path=public as $$
declare settlement public.event_staff_payments%rowtype;difference numeric;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede ajustar pagos de Staff.';end if;
  select * into settlement from public.event_staff_payments where id=p_payment_id and deleted_at is null and status='CONFIRMED';
  if settlement.id is null then raise exception 'Liquidación confirmada no encontrada.';end if;
  difference:=coalesce(p_operator,0)+coalesce(p_assembly,0)+coalesce(p_disassembly,0)-public.staff_settlement_original_net(settlement);
  if difference=0 then raise exception 'El valor ingresado es igual a la liquidación original.';end if;
  perform public.add_staff_settlement_adjustment(p_payment_id,'DIFFERENCE_CORRECTION',difference,p_reason);
end $$;

create or replace function public.event_staff_reimbursement_changed()
returns trigger language plpgsql security definer set search_path=public as $$
declare old_settlement uuid:=case when tg_op='INSERT' then null else old.event_staff_settlement_id end;
declare new_settlement uuid:=case when tg_op='DELETE' then null else new.event_staff_settlement_id end;
begin
  if old_settlement is not null then perform public.recalculate_event_staff_settlement(old_settlement);end if;
  if new_settlement is not null and new_settlement is distinct from old_settlement then perform public.recalculate_event_staff_settlement(new_settlement);end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists event_staff_reimbursement_sync on public.expenses;
create trigger event_staff_reimbursement_sync after insert or update of total,status,deleted_at,event_staff_settlement_id or delete on public.expenses
for each row execute function public.event_staff_reimbursement_changed();

create or replace view public.staff_settlement_financials with(security_invoker=true)as
select settlement.id settlement_id,settlement.staff_id,settlement.project_id,settlement.accounting_month,
  coalesce(settlement.original_operator_payment,settlement.automatic_operator_payment,settlement.operator_payment,0) original_operator,
  coalesce(settlement.original_assembly_payment,settlement.automatic_assembly_payment,settlement.assembly_payment,0) original_assembly,
  coalesce(settlement.original_disassembly_payment,settlement.automatic_disassembly_payment,settlement.disassembly_payment,0) original_disassembly,
  public.staff_settlement_original_net(settlement) original_net,
  coalesce(adjustment.total,0) adjustment_total,
  coalesce(reimbursement.total,0) reimbursement_total,
  public.staff_settlement_original_net(settlement)+coalesce(adjustment.total,0) payroll_net,
  public.staff_settlement_original_net(settlement)+coalesce(adjustment.total,0)+coalesce(reimbursement.total,0) final_amount,
  settlement.paid_amount,
  greatest(public.staff_settlement_original_net(settlement)+coalesce(adjustment.total,0)+coalesce(reimbursement.total,0)-settlement.paid_amount,0) remaining_balance,
  greatest(settlement.paid_amount-(public.staff_settlement_original_net(settlement)+coalesce(adjustment.total,0)+coalesce(reimbursement.total,0)),0) credit_balance,
  settlement.settlement_status,settlement.sii_receipt_status
from public.event_staff_payments settlement
left join lateral(select sum(amount)total from public.event_staff_settlement_adjustments where settlement_id=settlement.id)adjustment on true
left join lateral(select sum(total)total from public.expenses where event_staff_settlement_id=settlement.id and deleted_at is null and status<>'CANCELLED')reimbursement on true
where settlement.deleted_at is null and settlement.status='CONFIRMED';

drop view if exists public.staff_monthly_payroll;
drop view if exists public.staff_worked_events;
create view public.staff_worked_events with(security_invoker=true)as
select financial.settlement_id,financial.staff_id,financial.project_id,project.event_date,project.name event_name,customer.full_name customer,
  coalesce((select string_agg(service.service_code,' + ' order by service.service_code)from public.project_services service where service.project_id=project.id),project.project_type)service,
  settlement.tasks roles,financial.original_net generated_net,financial.adjustment_total,financial.reimbursement_total,financial.payroll_net,financial.final_amount,
  financial.paid_amount,financial.remaining_balance,financial.credit_balance,financial.settlement_status,financial.sii_receipt_status,financial.accounting_month
from public.staff_settlement_financials financial
join public.event_staff_payments settlement on settlement.id=financial.settlement_id
join public.projects project on project.id=financial.project_id
join public.customers customer on customer.id=project.customer_id;

create view public.staff_monthly_payroll with(security_invoker=true)as
select staff_id,accounting_month,count(*)events_worked,sum(generated_net)original_net,sum(adjustment_total)adjustment_total,
  sum(reimbursement_total)reimbursement_total,sum(payroll_net)payroll_net,sum(final_amount)final_amount,sum(paid_amount)paid_amount,
  sum(remaining_balance)remaining_balance,sum(credit_balance)credit_balance,
  count(*)filter(where sii_receipt_status='PENDING')receipt_pending,count(*)filter(where sii_receipt_status='RECEIVED')receipt_received
from public.staff_worked_events group by staff_id,accounting_month;

do $$declare item record;begin for item in select id from public.event_staff_payments where deleted_at is null loop perform public.recalculate_event_staff_settlement(item.id);end loop;end$$;

grant select on public.staff_settlement_financials,public.staff_worked_events,public.staff_monthly_payroll to authenticated;

commit;
