begin;

-- One canonical monthly calculation:
--   work obligation = event_staff_payments.total_internal_payment
--   work paid       = ADVANCE + PAYMENT - REVERSAL, capped per event
--   reimbursements  = approved expenses, kept outside the boleta base
--   final transfer   = work pending + reimbursement pending
create or replace function public.calculate_staff_monthly_settlement(p_staff_id uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  month_start date:=date_trunc('month',p_month)::date;
  rate numeric:=public.staff_withholding_rate_for_period(month_start);
  work_total numeric:=0; work_paid numeric:=0; work_pending numeric:=0; work_overpayment numeric:=0;
  reimbursement_total numeric:=0; reimbursement_paid numeric:=0; reimbursement_pending numeric:=0; reimbursement_overpayment numeric:=0;
  advances numeric:=0; payments numeric:=0; gross_amount numeric:=0; retention numeric:=0;
  cash_obligation numeric:=0; final_transfer numeric:=0; excess numeric:=0; event_total integer:=0;
  paid_field_mismatch_count integer:=0; paid_status_mismatch_count integer:=0; details jsonb:='[]'::jsonb;
begin
  select
    coalesce(sum(settlement.total_internal_payment),0),
    coalesce(sum(greatest(least(greatest(movement.work_paid_raw,0),coalesce(settlement.total_internal_payment,0)),0)),0),
    coalesce(sum(greatest(coalesce(settlement.total_internal_payment,0)-greatest(movement.work_paid_raw,0),0)),0),
    coalesce(sum(greatest(greatest(movement.work_paid_raw,0)-coalesce(settlement.total_internal_payment,0),0)),0),
    coalesce(sum(coalesce(financial.reimbursement_total,0)),0),
    coalesce(sum(coalesce(financial.reimbursement_paid_amount,0)),0),
    coalesce(sum(greatest(coalesce(financial.reimbursement_total,0)-coalesce(financial.reimbursement_paid_amount,0),0)),0),
    coalesce(sum(greatest(coalesce(financial.reimbursement_paid_amount,0)-coalesce(financial.reimbursement_total,0),0)),0),
    coalesce(sum(movement.advances),0),coalesce(sum(movement.payments),0),count(*),
    count(*) filter(where abs(coalesce(settlement.paid_amount,0)-greatest(movement.work_paid_raw,0))>0.01),
    count(*) filter(where settlement.settlement_status='PAID' and greatest(coalesce(settlement.total_internal_payment,0)-greatest(movement.work_paid_raw,0),0)>0),
    coalesce(jsonb_agg(jsonb_build_object(
      'settlementId',settlement.id,'projectId',project.id,'eventDate',project.event_date,
      'event',project.name,'customer',customer.full_name,
      'service',coalesce((select string_agg(service.service_code,' + ' order by service.service_code) from public.project_services service where service.project_id=project.id),project.project_type),
      'location',concat_ws(' · ',nullif(project.location,''),nullif(project.city,'')),
      'roles',settlement.tasks,
      'hours',coalesce((select max(service.duration_hours) from public.project_services service where service.project_id=project.id),(project.operations->>'durationHours')::numeric,0),
      'workNet',coalesce(settlement.total_internal_payment,0),
      'workPaid',least(greatest(movement.work_paid_raw,0),coalesce(settlement.total_internal_payment,0)),
      'workPending',greatest(coalesce(settlement.total_internal_payment,0)-greatest(movement.work_paid_raw,0),0),
      'workOverpayment',greatest(greatest(movement.work_paid_raw,0)-coalesce(settlement.total_internal_payment,0),0),
      'paidAmountField',coalesce(settlement.paid_amount,0),
      'advances',coalesce(movement.advances,0),'payments',coalesce(movement.payments,0),
      'reimbursements',coalesce(financial.reimbursement_total,0),
      'reimbursementsPaid',coalesce(financial.reimbursement_paid_amount,0),
      'reimbursementsPending',greatest(coalesce(financial.reimbursement_total,0)-coalesce(financial.reimbursement_paid_amount,0),0),
      'reimbursementOverpayment',greatest(coalesce(financial.reimbursement_paid_amount,0)-coalesce(financial.reimbursement_total,0),0),
      'settlementStatus',settlement.settlement_status
    ) order by settlement.accounting_month,project.event_date,project.event_time,settlement.id),'[]'::jsonb)
  into work_total,work_paid,work_pending,work_overpayment,reimbursement_total,reimbursement_paid,
    reimbursement_pending,reimbursement_overpayment,advances,payments,event_total,
    paid_field_mismatch_count,paid_status_mismatch_count,details
  from public.event_staff_payments settlement
  join public.projects project on project.id=settlement.project_id
  left join public.customers customer on customer.id=project.customer_id
  left join public.staff_settlement_financials financial on financial.settlement_id=settlement.id
  left join lateral (
    select
      coalesce(sum(case when movement.movement_type in ('ADVANCE','PAYMENT') then movement.amount when movement.movement_type='REVERSAL' then -movement.amount else 0 end),0) as work_paid_raw,
      coalesce(sum(case when movement.movement_type='ADVANCE' then movement.amount when movement.movement_type='REVERSAL' then -movement.amount else 0 end),0) as advances,
      coalesce(sum(case when movement.movement_type='PAYMENT' then movement.amount else 0 end),0) as payments
    from public.event_staff_settlement_movements movement
    where movement.settlement_id=settlement.id and movement.deleted_at is null
  ) movement on true
  where settlement.staff_id=p_staff_id and settlement.accounting_month=month_start
    and settlement.deleted_at is null and settlement.status='CONFIRMED'
    and project.deleted_at is null;

  advances:=greatest(advances,0);
  if rate is not null and work_total>0 then gross_amount:=round(work_total/(1-rate),0); end if;
  retention:=greatest(gross_amount-work_total,0);
  cash_obligation:=work_pending+reimbursement_pending;
  final_transfer:=greatest(cash_obligation,0);
  excess:=greatest(advances-work_total,0);

  return jsonb_build_object(
    'source','CANONICAL_STAFF_MONTHLY_SETTLEMENT_V4','rateSemantics','NET','periodSource','ACCOUNTING_MONTH','rounding','ROUND_CLP_HALF_AWAY_FROM_ZERO',
    'staffId',p_staff_id,'month',month_start,'eventCount',event_total,'details',details,
    'workNet',work_total,'workPaid',work_paid,'workPending',work_pending,'workOverpayment',work_overpayment,
    'boletaGross',gross_amount,'withholdingRate',coalesce(rate,0)*100,'withholdingAmount',retention,'boletaNet',work_total,
    'reimbursementsTotal',coalesce(reimbursement_total,0),'reimbursementsPaidTotal',coalesce(reimbursement_paid,0),
    'reimbursementsPendingTotal',coalesce(reimbursement_pending,0),'reimbursementsOverpayment',coalesce(reimbursement_overpayment,0),
    'advancesTotal',advances,'paymentsTotal',payments,'cashObligation',cash_obligation,'finalTransferAmount',final_transfer,
    'excessAdvance',excess,
    'reviewRequired',(rate is null or work_overpayment>0 or reimbursement_overpayment>0 or paid_field_mismatch_count>0 or paid_status_mismatch_count>0),
    'reviewReason',concat_ws(' · ',
      case when rate is null then 'Falta tasa de retención efectiva para el período' end,
      case when work_overpayment>0 then 'Existen pagos de trabajo sobre la obligación del Evento' end,
      case when reimbursement_overpayment>0 then 'Existen reembolsos pagados sobre gastos aprobados' end,
      case when paid_field_mismatch_count>0 then 'paid_amount no coincide con movimientos imputables' end,
      case when paid_status_mismatch_count>0 then 'Evento marcado PAID con saldo de trabajo pendiente' end)
  );
end $$;

-- Refresh only the derived monthly read model. No payment, receipt, expense,
-- boleta, close, notification or email row is created by this migration.
create or replace function public.ensure_staff_monthly_account(p_staff_id uuid,p_month date)
returns public.staff_monthly_accounts language plpgsql security definer set search_path=public as $$
declare month_start date:=date_trunc('month',p_month)::date; item public.staff_monthly_accounts%rowtype; calc jsonb; inserted_count integer:=0;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' and current_user not in('postgres','supabase_admin')
    and (auth.uid() is null or not public.can_administer()) then raise exception 'Acceso autorizado requerido.'; end if;
  calc:=public.calculate_staff_monthly_settlement(p_staff_id,month_start);
  calc:=jsonb_set(calc,'{blockingEvents}',public.staff_monthly_blocking_events(p_staff_id,month_start),true);
  insert into public.staff_monthly_accounts(staff_id,accounting_month,expected_amount)
  values(p_staff_id,month_start,(calc->>'finalTransferAmount')::numeric) on conflict(staff_id,accounting_month) do nothing;
  get diagnostics inserted_count=row_count;
  select * into item from public.staff_monthly_accounts where staff_id=p_staff_id and accounting_month=month_start for update;
  if item.settlement_status<>'FINALIZED' and item.payment_status<>'PAID' then
    update public.staff_monthly_accounts set expected_amount=(calc->>'finalTransferAmount')::numeric,
      work_net=(calc->>'workNet')::numeric,boleta_gross=(calc->>'boletaGross')::numeric,withholding_rate=(calc->>'withholdingRate')::numeric,
      withholding_amount=(calc->>'withholdingAmount')::numeric,boleta_net=(calc->>'boletaNet')::numeric,
      advances_total=(calc->>'advancesTotal')::numeric,reimbursements_total=(calc->>'reimbursementsTotal')::numeric,
      reimbursements_paid_total=(calc->>'reimbursementsPaidTotal')::numeric,
      reimbursements_pending_total=(calc->>'reimbursementsPendingTotal')::numeric,
      final_transfer_amount=(calc->>'finalTransferAmount')::numeric,excess_advance=(calc->>'excessAdvance')::numeric,
      event_count=(calc->>'eventCount')::integer,calculation=calc,review_required=(calc->>'reviewRequired')::boolean,
      review_reason=nullif(calc->>'reviewReason',''),updated_at=now() where id=item.id returning * into item;
  else
    update public.staff_monthly_accounts set
      reimbursements_total=(calc->>'reimbursementsTotal')::numeric,
      reimbursements_paid_total=(calc->>'reimbursementsPaidTotal')::numeric,
      reimbursements_pending_total=(calc->>'reimbursementsPendingTotal')::numeric,updated_at=now()
    where id=item.id returning * into item;
  end if;
  insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,reason,state)
  values(item.id,case when inserted_count>0 then 'GENERATED' else 'REFRESHED' end,auth.uid(),
    'Reconciliación canónica: obligación por event_staff_payments y saldo por movimientos/reembolsos.',calc);
  return item;
end $$;

-- Prevent new work movements from exceeding the event obligation. Historical
-- overpayments remain untouched and are surfaced as review_required.
create or replace function public.register_staff_settlement_movement(p_settlement_id uuid,p_type text,p_amount numeric,p_date date,p_method text,p_notes text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid; payment public.event_staff_payments%rowtype; work_paid numeric:=0; work_obligation numeric:=0;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede registrar pagos de Staff.'; end if;
  if p_type not in('ADVANCE','PAYMENT','REVERSAL') or coalesce(p_amount,0)<=0 then raise exception 'Movimiento de liquidación inválido.'; end if;
  select * into payment from public.event_staff_payments where id=p_settlement_id and deleted_at is null and status='CONFIRMED' for update;
  if payment.id is null then raise exception 'Liquidación confirmada no encontrada.'; end if;
  if exists(select 1 from public.staff_monthly_accounts account where account.staff_id=payment.staff_id and account.accounting_month=payment.accounting_month and account.settlement_status='FINALIZED') then raise exception 'La liquidación mensual está finalizada y no admite nuevos movimientos.'; end if;
  work_obligation:=coalesce(payment.total_internal_payment,0);
  select coalesce(sum(case when movement_type in ('ADVANCE','PAYMENT') then amount when movement_type='REVERSAL' then -amount else 0 end),0)
    into work_paid from public.event_staff_settlement_movements where settlement_id=payment.id and deleted_at is null;
  if p_type in ('ADVANCE','PAYMENT') and greatest(work_paid,0)+p_amount>work_obligation then
    raise exception 'El movimiento excede el saldo de trabajo pendiente del Evento.' using errcode='23514';
  end if;
  if p_type='REVERSAL' and p_amount>greatest(work_paid,0) then
    raise exception 'La reversa excede el trabajo pagado del Evento.' using errcode='23514';
  end if;
  insert into public.event_staff_settlement_movements(settlement_id,movement_type,amount,movement_date,method,notes,created_by,updated_by)
  values(p_settlement_id,p_type,p_amount,coalesce(p_date,current_date),nullif(trim(p_method),''),nullif(trim(p_notes),''),auth.uid(),auth.uid()) returning id into result;
  return result;
end $$;

do $$
declare row record; calc jsonb;
begin
  for row in select id,staff_id,accounting_month from public.staff_monthly_accounts where accounting_month='2026-09-01' loop
    calc:=public.calculate_staff_monthly_settlement(row.staff_id,row.accounting_month);
    calc:=jsonb_set(calc,'{blockingEvents}',public.staff_monthly_blocking_events(row.staff_id,row.accounting_month),true);
    update public.staff_monthly_accounts set expected_amount=(calc->>'finalTransferAmount')::numeric,
      work_net=(calc->>'workNet')::numeric,boleta_gross=(calc->>'boletaGross')::numeric,
      withholding_rate=(calc->>'withholdingRate')::numeric,withholding_amount=(calc->>'withholdingAmount')::numeric,
      boleta_net=(calc->>'boletaNet')::numeric,advances_total=(calc->>'advancesTotal')::numeric,
      reimbursements_total=(calc->>'reimbursementsTotal')::numeric,
      reimbursements_paid_total=(calc->>'reimbursementsPaidTotal')::numeric,
      reimbursements_pending_total=(calc->>'reimbursementsPendingTotal')::numeric,
      final_transfer_amount=(calc->>'finalTransferAmount')::numeric,excess_advance=(calc->>'excessAdvance')::numeric,
      event_count=(calc->>'eventCount')::integer,calculation=calc,
      review_required=(calc->>'reviewRequired')::boolean,review_reason=nullif(calc->>'reviewReason',''),updated_at=now()
    where id=row.id and settlement_status<>'FINALIZED' and payment_status<>'PAID';
    insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,reason,state)
    values(row.id,'REFRESHED',null,'RECONCILED_CANONICAL_LEDGER: reparación derivada de septiembre 2026; no se modificaron movimientos ni comprobantes.',calc);
  end loop;
end $$;

commit;
