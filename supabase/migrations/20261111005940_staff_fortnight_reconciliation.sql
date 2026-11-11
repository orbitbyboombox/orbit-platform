begin;

-- Preserve deployed V6 adjustments and owner reconciliation. Only detail metadata
-- and exclusion of invalid/cancelled assignment sources change. No fees change.
CREATE OR REPLACE FUNCTION public.calculate_staff_monthly_settlement_legacy(p_staff_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  month_start date := date_trunc('month', p_month)::date;
  rate numeric := public.staff_withholding_rate_for_period(month_start);
  work_total numeric := 0;
  work_paid numeric := 0;
  work_pending numeric := 0;
  work_overpayment numeric := 0;
  upcoming_total numeric := 0;
  reimbursement_total numeric := 0;
  reimbursement_paid numeric := 0;
  reimbursement_pending numeric := 0;
  reimbursement_overpayment numeric := 0;
  advances numeric := 0;
  payments numeric := 0;
  gross_amount numeric := 0;
  retention numeric := 0;
  cash_obligation numeric := 0;
  final_transfer numeric := 0;
  excess numeric := 0;
  event_total integer := 0;
  paid_field_mismatch_count integer := 0;
  paid_status_mismatch_count integer := 0;
  details jsonb := '[]'::jsonb;
  upcoming_details jsonb := '[]'::jsonb;
begin
  with base as (
    select
      settlement,
      project,
      customer,
      financial,
      adjustment.adjustment_total,
      assignment.assignment_type as assignment_role,
      movement,
      public.staff_payment_is_realized(
        (settlement).project_id,
        (settlement).assignment_id,
        (project).event_date
      ) as realized
    from public.event_staff_payments settlement
    join public.projects project on (project).id = (settlement).project_id
    left join public.customers customer on (customer).id = (project).customer_id
    left join public.assignments assignment
      on assignment.id = (settlement).assignment_id
      and assignment.project_id = (settlement).project_id
      and assignment.deleted_at is null
    left join public.staff_settlement_financials financial
      on (financial).settlement_id = (settlement).id
    left join lateral (
      select coalesce(sum(a.amount), 0) as adjustment_total
      from public.event_staff_settlement_adjustments a
      where a.settlement_id = (settlement).id
        and a.amount <> 0
    ) adjustment on true
    left join lateral (
      select
        coalesce(sum(case
          when (movement).movement_type in ('ADVANCE', 'PAYMENT') then (movement).amount
          when (movement).movement_type = 'REVERSAL' then -(movement).amount
          else 0
        end), 0) as work_paid_raw,
        coalesce(sum(case
          when (movement).movement_type = 'ADVANCE' then (movement).amount
          when (movement).movement_type = 'REVERSAL' then -(movement).amount
          else 0
        end), 0) as advances,
        coalesce(sum(case when (movement).movement_type = 'PAYMENT'
          then (movement).amount else 0 end), 0) as payments
      from public.event_staff_settlement_movements movement
      where (movement).settlement_id = (settlement).id
        and (movement).deleted_at is null
    ) movement on true
    where coalesce(assignment.staff_id, (settlement).staff_id) = p_staff_id
      and (settlement).accounting_month = month_start
      and (settlement).deleted_at is null
      and (settlement).status <> 'CANCELLED'
      and (project).deleted_at is null
      and ((settlement).assignment_id is null or (assignment.id is not null and assignment.status not in ('CANCELLED','REJECTED')))
  )
  select
    coalesce(sum((settlement).total_internal_payment + adjustment_total)
      filter (where realized and (settlement).status = 'CONFIRMED'), 0),
    coalesce(sum(greatest(least(
      greatest((movement).work_paid_raw, 0),
      coalesce((settlement).total_internal_payment, 0) + adjustment_total
    ), 0)) filter (where realized and (settlement).status = 'CONFIRMED'), 0),
    coalesce(sum(greatest(
      coalesce((settlement).total_internal_payment, 0) + adjustment_total
        - greatest((movement).work_paid_raw, 0),
      0
    )) filter (where realized and (settlement).status = 'CONFIRMED'), 0),
    coalesce(sum(greatest(
      greatest((movement).work_paid_raw, 0)
        - (coalesce((settlement).total_internal_payment, 0) + adjustment_total),
      0
    )) filter (where realized and (settlement).status = 'CONFIRMED'), 0),
    coalesce(sum((settlement).total_internal_payment + adjustment_total)
      filter (where not realized and (settlement).status in ('ESTIMATED', 'CONFIRMED')), 0),
    coalesce(sum(coalesce((financial).reimbursement_total, 0)), 0),
    coalesce(sum(coalesce((financial).reimbursement_paid_amount, 0)), 0),
    coalesce(sum(greatest(
      coalesce((financial).reimbursement_total, 0)
        - coalesce((financial).reimbursement_paid_amount, 0),
      0
    )), 0),
    coalesce(sum(greatest(
      coalesce((financial).reimbursement_paid_amount, 0)
        - coalesce((financial).reimbursement_total, 0),
      0
    )), 0),
    coalesce(sum((movement).advances)
      filter (where realized and (settlement).status = 'CONFIRMED'), 0),
    coalesce(sum((movement).payments)
      filter (where realized and (settlement).status = 'CONFIRMED'), 0),
    count(*) filter (where realized and (settlement).status = 'CONFIRMED'),
    count(*) filter (where realized and (settlement).status = 'CONFIRMED'
      and abs(coalesce((settlement).paid_amount, 0)
        - greatest((movement).work_paid_raw, 0)) > 0.01),
    count(*) filter (where realized and (settlement).status = 'CONFIRMED'
      and (settlement).settlement_status = 'PAID'
      and greatest(
        coalesce((settlement).total_internal_payment, 0) + adjustment_total
          - greatest((movement).work_paid_raw, 0),
        0
      ) > 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'settlementId', (settlement).id,
      'projectId', (project).id,
      'eventDate', (project).event_date,
      'event', (project).name,
      'customer', (customer).full_name,
      'service', coalesce((select string_agg(service.service_code, ' + ' order by service.service_code)
        from public.project_services service
        where service.project_id = (project).id), (project).project_type),
      'location', concat_ws(' · ', nullif((project).location, ''), nullif((project).city, '')),
      'roles', case when assignment_role='SUPERVISOR' then array['SUPERVISOR']::text[] else (settlement).tasks end,
      'assignmentId', (settlement).assignment_id,
      'blockId', (settlement).block_id,
      'blockName', (select name from public.event_operational_blocks where id=(settlement).block_id),
      'hours', coalesce((settlement).contracted_minutes/60.0, (settlement).contracted_hours, (select max(service.duration_hours)
        from public.project_services service
        where service.project_id = (project).id),
        ((project).operations->>'durationHours')::numeric, 0),
      'workNet', coalesce((settlement).total_internal_payment, 0) + adjustment_total,
      'baseWorkNet', coalesce((settlement).total_internal_payment, 0),
      'adjustmentTotal', adjustment_total,
      'workPaid', least(greatest((movement).work_paid_raw, 0),
        coalesce((settlement).total_internal_payment, 0) + adjustment_total),
      'workPending', greatest(
        coalesce((settlement).total_internal_payment, 0) + adjustment_total
          - greatest((movement).work_paid_raw, 0), 0),
      'workOverpayment', greatest(
        greatest((movement).work_paid_raw, 0)
          - (coalesce((settlement).total_internal_payment, 0) + adjustment_total), 0),
      'paidAmountField', coalesce((settlement).paid_amount, 0),
      'advances', coalesce((movement).advances, 0),
      'payments', coalesce((movement).payments, 0),
      'reimbursements', coalesce((financial).reimbursement_total, 0),
      'reimbursementsPaid', coalesce((financial).reimbursement_paid_amount, 0),
      'reimbursementsPending', greatest(
        coalesce((financial).reimbursement_total, 0)
          - coalesce((financial).reimbursement_paid_amount, 0), 0),
      'reimbursementOverpayment', greatest(
        coalesce((financial).reimbursement_paid_amount, 0)
          - coalesce((financial).reimbursement_total, 0), 0),
      'settlementStatus', (settlement).settlement_status
    ) order by (project).event_date, (project).event_time, (settlement).id)
      filter (where realized and (settlement).status = 'CONFIRMED'), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'settlementId', (settlement).id,
      'projectId', (project).id,
      'eventDate', (project).event_date,
      'event', (project).name,
      'customer', (customer).full_name,
      'roles', case when assignment_role='SUPERVISOR' then array['SUPERVISOR']::text[] else (settlement).tasks end,
      'workNet', coalesce((settlement).total_internal_payment, 0) + adjustment_total,
      'adjustmentTotal', adjustment_total,
      'status', (settlement).status,
      'assignmentId', (settlement).assignment_id,
      'blockId', (settlement).block_id
    ) order by (project).event_date, (project).event_time, (settlement).id)
      filter (where not realized and (settlement).status in ('ESTIMATED', 'CONFIRMED')), '[]'::jsonb)
  into work_total, work_paid, work_pending, work_overpayment, upcoming_total,
    reimbursement_total, reimbursement_paid, reimbursement_pending,
    reimbursement_overpayment, advances, payments, event_total,
    paid_field_mismatch_count, paid_status_mismatch_count, details, upcoming_details
  from base;

  advances := greatest(advances, 0);
  if rate is not null and work_total > 0 then
    gross_amount := round(work_total / (1 - rate), 0);
  end if;
  retention := greatest(gross_amount - work_total, 0);
  cash_obligation := work_pending + reimbursement_pending;
  final_transfer := greatest(cash_obligation, 0);
  excess := greatest(advances - work_total, 0);

  return jsonb_build_object(
    'source', 'CANONICAL_STAFF_MONTHLY_SETTLEMENT_V6',
    'rateSemantics', 'NET',
    'periodSource', 'ACCOUNTING_MONTH',
    'realizedRule', 'EVENT_DATE_OR_COMPLETED_ASSIGNMENT',
    'rounding', 'ROUND_CLP_HALF_AWAY_FROM_ZERO',
    'staffId', p_staff_id,
    'month', month_start,
    'eventCount', event_total,
    'details', details,
    'upcomingDetails', upcoming_details,
    'upcomingTotal', upcoming_total,
    'workNet', work_total,
    'workPaid', work_paid,
    'workPending', work_pending,
    'workOverpayment', work_overpayment,
    'boletaGross', gross_amount,
    'withholdingRate', coalesce(rate, 0) * 100,
    'withholdingAmount', retention,
    'boletaNet', work_total,
    'reimbursementsTotal', coalesce(reimbursement_total, 0),
    'reimbursementsPaidTotal', coalesce(reimbursement_paid, 0),
    'reimbursementsPendingTotal', coalesce(reimbursement_pending, 0),
    'reimbursementsOverpayment', coalesce(reimbursement_overpayment, 0),
    'advancesTotal', advances,
    'paymentsTotal', payments,
    'cashObligation', cash_obligation,
    'finalTransferAmount', final_transfer,
    'excessAdvance', excess,
    'reviewRequired', (rate is null or work_overpayment > 0
      or reimbursement_overpayment > 0 or paid_field_mismatch_count > 0
      or paid_status_mismatch_count > 0),
    'reviewReason', concat_ws(' · ',
      case when rate is null then 'Falta tasa de retención efectiva para el período' end,
      case when work_overpayment > 0 then 'Existen pagos de trabajo sobre la obligación del Evento' end,
      case when reimbursement_overpayment > 0 then 'Existen reembolsos pagados sobre gastos aprobados' end,
      case when paid_field_mismatch_count > 0 then 'paid_amount no coincide con movimientos imputables' end,
      case when paid_status_mismatch_count > 0 then 'Evento marcado PAID con saldo de trabajo pendiente' end)
  );
end;
$function$

;

-- One interval projection for both the audit preview and configured payment blocks.
create function public.staff_settlement_period_slice(p_calculation jsonb,p_start date,p_end date)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare details jsonb; upcoming jsonb; work numeric; paid numeric; advances numeric;
  reimbursements numeric; reimbursements_paid numeric; rate numeric; gross numeric;
begin
  select coalesce(jsonb_agg(d order by d->>'eventDate',d->>'settlementId'),'[]'::jsonb),
    coalesce(sum((d->>'workNet')::numeric),0),coalesce(sum((d->>'workPaid')::numeric),0),
    coalesce(sum((d->>'advances')::numeric),0),coalesce(sum((d->>'reimbursements')::numeric),0),coalesce(sum((d->>'reimbursementsPaid')::numeric),0)
  into details,work,paid,advances,reimbursements,reimbursements_paid
  from jsonb_array_elements(coalesce(p_calculation->'details','[]')) d where (d->>'eventDate')::date between p_start and p_end;
  select coalesce(jsonb_agg(d),'[]'::jsonb) into upcoming from jsonb_array_elements(coalesce(p_calculation->'upcomingDetails','[]')) d
    where (d->>'eventDate')::date between p_start and p_end;
  rate:=(p_calculation->>'withholdingRate')::numeric/100;
  gross:=round(work/nullif(1-rate,0),0);
  return p_calculation || jsonb_build_object('startsOn',p_start,'endsOn',p_end,
    'details',details,'eventCount',jsonb_array_length(details),'upcomingDetails',upcoming,
    'workNet',work,'workPaid',paid,'workPending',greatest(work-paid,0),
    'advancesTotal',advances,'boletaGross',gross,'boletaNet',work,'withholdingAmount',gross-work,
    'reimbursementsTotal',reimbursements,'reimbursementsPaidTotal',reimbursements_paid,'reimbursementsPendingTotal',greatest(reimbursements-reimbursements_paid,0),
    'finalTransferAmount',greatest(work-paid,0),'reviewRequired',coalesce((p_calculation->>'reviewRequired')::boolean,true) or jsonb_array_length(upcoming)>0,
    'reviewReason',concat_ws(' · ',nullif(p_calculation->>'reviewReason',''),case when jsonb_array_length(upcoming)>0 then 'Hay servicios pendientes en este bloque' end));
end $$;
revoke all on function public.staff_settlement_period_slice(jsonb,date,date) from public,anon,authenticated;

create or replace function public.staff_payment_period_calculation(p_period_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare period public.staff_payment_periods; account public.staff_monthly_accounts;
begin
  select * into period from public.staff_payment_periods where id=p_period_id;
  if not found then raise exception 'Período no encontrado.'; end if;
  select * into account from public.staff_monthly_accounts where id=period.account_id;
  return public.staff_settlement_period_slice(public.calculate_staff_monthly_settlement(account.staff_id,account.accounting_month),period.starts_on,period.ends_on)
    ||jsonb_build_object('periodId',period.id,'periodCode',period.period_code);
end $$;

create function public.preview_staff_first_fortnight(p_month date)
returns table(account_id uuid,staff_id uuid,staff_name text,starts_on date,ends_on date,work_net numeric,training_net numeric,reimbursements numeric,paid numeric,pending numeric,event_count integer,boleta_status text,review_required boolean,review_reason text)
language plpgsql stable security definer set search_path='' as $$
declare month_start date:=date_trunc('month',p_month)::date;
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  if p_month is null then raise exception 'Mes requerido.'; end if;
  return query
  with calculated as materialized (
    select a.id,a.staff_id,s.first_name||' '||s.last_name as name,a.boleta_status,
      public.staff_settlement_period_slice(
        case when a.settlement_status='FINALIZED' or a.payment_status='PAID' then coalesce(a.finalized_snapshot,a.calculation)
          else public.calculate_staff_monthly_settlement(a.staff_id,a.accounting_month) end,month_start,month_start+13) calc
    from public.staff_monthly_accounts a join public.staff s on s.id=a.staff_id
    where a.accounting_month=month_start and s.deleted_at is null
  )
  select c.id,c.staff_id,c.name,month_start,month_start+13,(c.calc->>'workNet')::numeric,
    (select coalesce(sum((d->>'workNet')::numeric),0) from jsonb_array_elements(c.calc->'details') d where d ? 'trainingAssignmentId'),
    (c.calc->>'reimbursementsPendingTotal')::numeric,(c.calc->>'workPaid')::numeric,(c.calc->>'workPending')::numeric,
    (c.calc->>'eventCount')::integer,c.boleta_status,(c.calc->>'reviewRequired')::boolean,c.calc->>'reviewReason'
  from calculated c where (c.calc->>'workNet')::numeric>0 or (c.calc->>'reimbursementsPendingTotal')::numeric>0 order by c.name;
end $$;
revoke all on function public.preview_staff_first_fortnight(date) from public,anon;
grant execute on function public.preview_staff_first_fortnight(date) to authenticated;

-- Refresh only existing open projections when their canonical inputs change.
-- Paid/finalized accounts return before ensure_staff_monthly_account is invoked.
create function public.refresh_open_staff_account_from_source()
returns trigger language plpgsql security definer set search_path='' as $$
declare row_before jsonb:=to_jsonb(old); row_after jsonb:=to_jsonb(new); source record; account public.staff_monthly_accounts;
begin
  if tg_table_name='event_staff_payments' then
    for source in select distinct x.staff_id,x.month from (
      values ((row_before->>'staff_id')::uuid,(row_before->>'accounting_month')::date),
             ((row_after->>'staff_id')::uuid,(row_after->>'accounting_month')::date)
    ) x(staff_id,month) where x.staff_id is not null and x.month is not null order by x.staff_id,x.month loop
      select * into account from public.staff_monthly_accounts where staff_id=source.staff_id and accounting_month=source.month for update;
      if found and account.settlement_status<>'FINALIZED' and account.payment_status<>'PAID' then perform public.ensure_staff_monthly_account(source.staff_id,source.month); end if;
    end loop;
  elsif tg_table_name='event_staff_settlement_adjustments' then
    for source in select distinct p.staff_id,p.accounting_month as month from public.event_staff_payments p
      where p.id in ((row_before->>'settlement_id')::uuid,(row_after->>'settlement_id')::uuid) order by p.staff_id,p.accounting_month loop
      select * into account from public.staff_monthly_accounts where staff_id=source.staff_id and accounting_month=source.month for update;
      if found and account.settlement_status<>'FINALIZED' and account.payment_status<>'PAID' then perform public.ensure_staff_monthly_account(source.staff_id,source.month); end if;
    end loop;
  end if;
  return coalesce(new,old);
end $$;
revoke all on function public.refresh_open_staff_account_from_source() from public,anon,authenticated;
create trigger zz_staff_open_account_payment_source after insert or update or delete on public.event_staff_payments for each row execute function public.refresh_open_staff_account_from_source();
create trigger zz_staff_open_account_adjustment_source after insert or update or delete on public.event_staff_settlement_adjustments for each row execute function public.refresh_open_staff_account_from_source();

-- Reconcile November DRAFT projections only. No movements, fees or closed snapshots change.
do $$
declare account record;
begin
  for account in select staff_id,accounting_month from public.staff_monthly_accounts where accounting_month='2026-11-01' and settlement_status='DRAFT' and payment_status<>'PAID' order by staff_id loop
    perform public.ensure_staff_monthly_account(account.staff_id,account.accounting_month);
  end loop;
end $$;
commit;
