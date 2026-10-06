begin;

alter table public.event_staff_payments
  add column if not exists override_operator_payment numeric(14,2),
  add column if not exists override_assembly_payment numeric(14,2),
  add column if not exists override_disassembly_payment numeric(14,2);

alter table public.event_staff_payments
  drop constraint if exists event_staff_payments_override_operator_payment_check,
  drop constraint if exists event_staff_payments_override_assembly_payment_check,
  drop constraint if exists event_staff_payments_override_disassembly_payment_check;

alter table public.event_staff_payments
  add constraint event_staff_payments_override_operator_payment_check check (override_operator_payment is null or override_operator_payment >= 0),
  add constraint event_staff_payments_override_assembly_payment_check check (override_assembly_payment is null or override_assembly_payment >= 0),
  add constraint event_staff_payments_override_disassembly_payment_check check (override_disassembly_payment is null or override_disassembly_payment >= 0);

create or replace function public.staff_settlement_payable_net(p_settlement public.event_staff_payments)
returns numeric language sql immutable as $$
  select
    coalesce(case when p_settlement.override_operator_payment is null then p_settlement.operator_payment else p_settlement.override_operator_payment end,0)
    + coalesce(case when p_settlement.override_assembly_payment is null then p_settlement.assembly_payment else p_settlement.override_assembly_payment end,0)
    + coalesce(case when p_settlement.override_disassembly_payment is null then p_settlement.disassembly_payment else p_settlement.override_disassembly_payment end,0)
    + coalesce(p_settlement.transport_bonus,0)
    + coalesce(p_settlement.parking_payment,0)
$$;

create or replace function public.refresh_staff_event_payment(p_project_id uuid,p_staff_id uuid,p_actor uuid default auth.uid())
returns uuid language plpgsql security definer set search_path=public as $$
declare selected_assignment uuid; selected_tasks text[]; hours integer; operator_amount numeric(14,2):=0; assembly_amount numeric(14,2):=0; disassembly_amount numeric(14,2):=0; existing_payment public.event_staff_payments%rowtype; payment_id uuid; event_code text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':'||p_staff_id::text||':event-settlement',0));
  select (array_agg(id order by id))[1],array_agg(distinct assignment_type order by assignment_type) into selected_assignment,selected_tasks
  from public.assignments where project_id=p_project_id and staff_id=p_staff_id and deleted_at is null and status not in('CANCELLED','REJECTED') and assignment_type in('OPERATOR','ASSEMBLY','DISASSEMBLY');
  if selected_assignment is null then
    update public.event_staff_payments set status='CANCELLED',deleted_at=coalesce(deleted_at,now()),updated_by=p_actor where project_id=p_project_id and staff_id=p_staff_id and deleted_at is null;
    return null;
  end if;
  select max(duration_hours)::integer into hours from public.project_services where project_id=p_project_id;
  if hours is null then raise exception 'El Evento no tiene una duración oficial configurada.'; end if;
  select orbit_event_id into event_code from public.projects where id=p_project_id;
  if 'OPERATOR'=any(selected_tasks) then select amount into operator_amount from public.cost_master_entries where code='OPERATOR_'||hours||'_HOURS' and enabled and deleted_at is null; if coalesce(operator_amount,0)<=0 then raise exception 'Falta la tarifa oficial de Operador para % horas.',hours; end if; end if;
  if 'ASSEMBLY'=any(selected_tasks) then select amount into assembly_amount from public.cost_master_entries where code='ASSEMBLY' and enabled and deleted_at is null; if coalesce(assembly_amount,0)<=0 then raise exception 'Falta la tarifa oficial de Montaje.'; end if; end if;
  if 'DISASSEMBLY'=any(selected_tasks) then select amount into disassembly_amount from public.cost_master_entries where code='DISASSEMBLY' and enabled and deleted_at is null; if coalesce(disassembly_amount,0)<=0 then raise exception 'Falta la tarifa oficial de Desmontaje.'; end if; end if;
  if 'ASSEMBLY'=any(selected_tasks) and 'DISASSEMBLY'=any(selected_tasks) then select amount into assembly_amount from public.cost_master_entries where code='ASSEMBLY_DISASSEMBLY' and enabled and deleted_at is null; if coalesce(assembly_amount,0)<=0 then raise exception 'Falta la tarifa oficial de Montaje + Desmontaje.'; end if; disassembly_amount:=assembly_amount-round(assembly_amount/2); assembly_amount:=round(assembly_amount/2); end if;
  select * into existing_payment from public.event_staff_payments where project_id=p_project_id and staff_id=p_staff_id and deleted_at is null and status<>'CANCELLED' order by (override_at is not null) desc,updated_at desc limit 1;
  if existing_payment.id is null then
    insert into public.event_staff_payments(project_id,assignment_id,staff_id,orbit_event_id,contracted_hours,tasks,destination_province,assembly_payment,operator_payment,disassembly_payment,automatic_assembly_payment,automatic_operator_payment,automatic_disassembly_payment,created_by,updated_by)
    values(p_project_id,selected_assignment,p_staff_id,event_code,hours,selected_tasks,'SANTIAGO',assembly_amount,operator_amount,disassembly_amount,assembly_amount,operator_amount,disassembly_amount,p_actor,p_actor) returning id into payment_id;
  else
    update public.event_staff_payments set assignment_id=selected_assignment,contracted_hours=hours,tasks=selected_tasks,automatic_assembly_payment=assembly_amount,automatic_operator_payment=operator_amount,automatic_disassembly_payment=disassembly_amount,
      assembly_payment=case when override_at is null and override_assembly_payment is null then assembly_amount else assembly_payment end,
      operator_payment=case when override_at is null and override_operator_payment is null then operator_amount else operator_payment end,
      disassembly_payment=case when override_at is null and override_disassembly_payment is null then disassembly_amount else disassembly_payment end,updated_by=p_actor where id=existing_payment.id returning id into payment_id;
  end if;
  return payment_id;
end $$;

create or replace function public.refresh_staff_block_payment(p_assignment_id uuid,p_actor uuid default auth.uid())
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.assignments%rowtype; b public.event_operational_blocks%rowtype; rate numeric(14,2); payment_id uuid; event_code text; minutes integer; rate_code text;
begin
  select * into a from public.assignments where id=p_assignment_id and deleted_at is null and status not in('CANCELLED','REJECTED');
  if a.id is null or a.block_id is null then return null; end if;
  select * into b from public.event_operational_blocks where id=a.block_id and project_id=a.project_id;
  minutes:=round(extract(epoch from (b.end_at-b.start_at))/60)::integer;
  rate_code:=case when minutes%60=0 then 'OPERATOR_'||(minutes/60)::text||'_HOURS' when minutes%60=30 then 'OPERATOR_'||(minutes/60)::text||'_5_HOURS' else null end;
  if a.assignment_type='OPERATOR' and rate_code is not null then select amount into rate from public.cost_master_entries where code=rate_code and enabled and deleted_at is null; end if;
  select orbit_event_id into event_code from public.projects where id=a.project_id;
  select id into payment_id from public.event_staff_payments where assignment_id=a.id and deleted_at is null and status<>'CANCELLED' for update;
  if payment_id is null then
    insert into public.event_staff_payments(project_id,assignment_id,staff_id,orbit_event_id,contracted_hours,contracted_minutes,block_id,tasks,destination_province,assembly_payment,operator_payment,disassembly_payment,automatic_assembly_payment,automatic_operator_payment,automatic_disassembly_payment,created_by,updated_by,status)
    values(a.project_id,a.id,a.staff_id,event_code,greatest(2,ceil(minutes/60.0)::integer),minutes,a.block_id,case when a.assignment_type='OPERATOR' then array['OPERATOR'] else array[a.assignment_type] end,'SANTIAGO',0,case when a.assignment_type='OPERATOR' then coalesce(rate,0) else 0 end,0,0,case when a.assignment_type='OPERATOR' then coalesce(rate,0) else 0 end,0,p_actor,p_actor,'ESTIMATED') returning id into payment_id;
  else
    update public.event_staff_payments set contracted_hours=greatest(2,ceil(minutes/60.0)::integer),contracted_minutes=minutes,block_id=a.block_id,
      operator_payment=case when override_at is null and override_operator_payment is null and a.assignment_type='OPERATOR' then coalesce(rate,0) else operator_payment end,
      automatic_operator_payment=case when a.assignment_type='OPERATOR' then coalesce(rate,0) else automatic_operator_payment end,updated_by=p_actor where id=payment_id;
  end if;
  insert into public.event_staff_block_costs(project_id,block_id,staff_id,settlement_id,role,amount,duration_minutes,status,updated_at)
  values(a.project_id,a.block_id,a.staff_id,payment_id,a.assignment_type,rate,minutes,case when rate is null then 'REVIEW_REQUIRED' else 'RESOLVED' end,now())
  on conflict(block_id,staff_id,role) do update set settlement_id=excluded.settlement_id,amount=excluded.amount,duration_minutes=excluded.duration_minutes,status=excluded.status,updated_at=now();
  return payment_id;
end $$;

create or replace function public.set_staff_assignment_payment_override(p_payment_id uuid,p_role text,p_amount numeric,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare payment public.event_staff_payments%rowtype; default_amount numeric(14,2);
begin
  if not public.can_administer() then raise exception 'Solo Administración puede modificar pagos de Staff.'; end if;
  if p_role not in ('OPERATOR','ASSEMBLY','DISASSEMBLY') then raise exception 'Rol de pago inválido.'; end if;
  if p_amount is null or p_amount<0 or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Ingresa un monto válido y un motivo de al menos 3 caracteres.'; end if;
  select * into payment from public.event_staff_payments where id=p_payment_id and deleted_at is null and status<>'CANCELLED' for update;
  if payment.id is null then raise exception 'Asignación de pago no encontrada.'; end if;
  if payment.settlement_status in ('PAID','FINALIZED') or coalesce(payment.paid_amount,0)>0 then raise exception 'El pago ya fue liquidado y no se puede modificar.'; end if;
  default_amount:=case p_role when 'OPERATOR' then coalesce(payment.automatic_operator_payment,payment.operator_payment,0) when 'ASSEMBLY' then coalesce(payment.automatic_assembly_payment,payment.assembly_payment,0) else coalesce(payment.automatic_disassembly_payment,payment.disassembly_payment,0) end;
  if p_amount=default_amount then raise exception 'El monto coincide con la tarifa base; usa Restablecer tarifa para quitar el override.'; end if;
  if p_role='OPERATOR' then update public.event_staff_payments set override_operator_payment=p_amount,operator_payment=p_amount,override_reason=trim(p_reason),override_by=auth.uid(),override_at=now(),updated_by=auth.uid() where id=p_payment_id;
  elsif p_role='ASSEMBLY' then update public.event_staff_payments set override_assembly_payment=p_amount,assembly_payment=p_amount,override_reason=trim(p_reason),override_by=auth.uid(),override_at=now(),updated_by=auth.uid() where id=p_payment_id;
  else update public.event_staff_payments set override_disassembly_payment=p_amount,disassembly_payment=p_amount,override_reason=trim(p_reason),override_by=auth.uid(),override_at=now(),updated_by=auth.uid() where id=p_payment_id; end if;
end $$;

create or replace function public.reset_staff_assignment_payment_override(p_payment_id uuid,p_role text)
returns void language plpgsql security definer set search_path=public as $$
declare payment public.event_staff_payments%rowtype;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede restablecer pagos de Staff.'; end if;
  if p_role not in ('OPERATOR','ASSEMBLY','DISASSEMBLY') then raise exception 'Rol de pago inválido.'; end if;
  select * into payment from public.event_staff_payments where id=p_payment_id and deleted_at is null and status<>'CANCELLED' for update;
  if payment.id is null then raise exception 'Asignación de pago no encontrada.'; end if;
  if payment.settlement_status in ('PAID','FINALIZED') or coalesce(payment.paid_amount,0)>0 then raise exception 'El pago ya fue liquidado y no se puede modificar.'; end if;
  if p_role='OPERATOR' then update public.event_staff_payments set override_operator_payment=null,operator_payment=coalesce(automatic_operator_payment,0),override_reason=null,override_by=null,override_at=null,updated_by=auth.uid() where id=p_payment_id;
  elsif p_role='ASSEMBLY' then update public.event_staff_payments set override_assembly_payment=null,assembly_payment=coalesce(automatic_assembly_payment,0),override_reason=null,override_by=null,override_at=null,updated_by=auth.uid() where id=p_payment_id;
  else update public.event_staff_payments set override_disassembly_payment=null,disassembly_payment=coalesce(automatic_disassembly_payment,0),override_reason=null,override_by=null,override_at=null,updated_by=auth.uid() where id=p_payment_id; end if;
end $$;

create or replace view public.staff_settlement_financials with(security_invoker=true) as
select settlement.id settlement_id,settlement.staff_id,settlement.project_id,settlement.accounting_month,
  coalesce(settlement.original_operator_payment,settlement.automatic_operator_payment,settlement.operator_payment,0) original_operator,
  coalesce(settlement.original_assembly_payment,settlement.automatic_assembly_payment,settlement.assembly_payment,0) original_assembly,
  coalesce(settlement.original_disassembly_payment,settlement.automatic_disassembly_payment,settlement.disassembly_payment,0) original_disassembly,
  public.staff_settlement_original_net(settlement) original_net,
  coalesce(adjustment.total,0) adjustment_total,coalesce(reimbursement.total,0) reimbursement_total,
  coalesce(reimbursement_payment.total,0) reimbursement_paid_amount,
  greatest(coalesce(reimbursement.total,0)-coalesce(reimbursement_payment.total,0),0) reimbursement_pending_amount,
  public.staff_settlement_payable_net(settlement)+coalesce(adjustment.total,0) payroll_net,
  public.staff_settlement_payable_net(settlement)+coalesce(adjustment.total,0)+coalesce(reimbursement.total,0) final_amount,
  settlement.paid_amount,
  least(settlement.paid_amount,public.staff_settlement_payable_net(settlement)+coalesce(adjustment.total,0)) payroll_paid_amount,
  greatest(public.staff_settlement_payable_net(settlement)+coalesce(adjustment.total,0)+coalesce(reimbursement.total,0)-settlement.paid_amount,0) remaining_balance,
  greatest(settlement.paid_amount-(public.staff_settlement_payable_net(settlement)+coalesce(adjustment.total,0)+coalesce(reimbursement.total,0)),0) credit_balance,
  settlement.settlement_status,settlement.sii_receipt_status
from public.event_staff_payments settlement
left join lateral(select sum(amount) total from public.event_staff_settlement_adjustments where settlement_id=settlement.id) adjustment on true
left join lateral(
  select sum(submission.amount) total
  from public.staff_expense_submissions submission
  where submission.staff_id=settlement.staff_id and submission.project_id=settlement.project_id
    and submission.status='APPROVED' and submission.reimbursement=true
) reimbursement on true
left join lateral(
  select sum(payment.amount) total
  from public.staff_reimbursement_payments payment
  join public.staff_expense_submissions submission on submission.id=payment.staff_expense_submission_id
  where payment.settlement_id=settlement.id and submission.staff_id=settlement.staff_id
    and submission.project_id=settlement.project_id and submission.status='APPROVED' and submission.reimbursement=true
) reimbursement_payment on true
where settlement.deleted_at is null and settlement.status='CONFIRMED';

grant execute on function public.set_staff_assignment_payment_override(uuid,text,numeric,text) to authenticated;
grant execute on function public.reset_staff_assignment_payment_override(uuid,text) to authenticated;
grant select on public.staff_settlement_financials to authenticated;

commit;
