CREATE OR REPLACE FUNCTION public.ensure_staff_monthly_account(p_staff_id uuid, p_month date)
 RETURNS staff_monthly_accounts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  month_start date := date_trunc('month', p_month)::date;
  item public.staff_monthly_accounts%rowtype;
  calc jsonb;
  inserted_count integer := 0;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin')
     and (auth.uid() is null or not public.can_administer()) then
    raise exception 'Acceso autorizado requerido.';
  end if;

  calc := public.calculate_staff_monthly_settlement(p_staff_id, month_start);
  calc := jsonb_set(calc, '{blockingEvents}', public.staff_monthly_blocking_events(p_staff_id, month_start), true);
  insert into public.staff_monthly_accounts(staff_id, accounting_month, expected_amount)
  values (p_staff_id, month_start, (calc->>'finalTransferAmount')::numeric)
  on conflict (staff_id, accounting_month) do nothing;
  get diagnostics inserted_count = row_count;

  select * into item
  from public.staff_monthly_accounts
  where staff_id = p_staff_id and accounting_month = month_start
  for update;

  if item.settlement_status <> 'FINALIZED' and item.payment_status <> 'PAID' then
    update public.staff_monthly_accounts set
      expected_amount = (calc->>'finalTransferAmount')::numeric,
      work_net = (calc->>'workNet')::numeric,
      boleta_gross = (calc->>'boletaGross')::numeric,
      withholding_rate = (calc->>'withholdingRate')::numeric,
      withholding_amount = (calc->>'withholdingAmount')::numeric,
      boleta_net = (calc->>'boletaNet')::numeric,
      advances_total = (calc->>'advancesTotal')::numeric,
      reimbursements_total = coalesce((calc->>'reimbursementsTotal')::numeric, 0),
      reimbursements_paid_total = coalesce((calc->>'reimbursementsPaidTotal')::numeric, 0),
      reimbursements_pending_total = coalesce((calc->>'reimbursementsPendingTotal')::numeric, 0),
      final_transfer_amount = (calc->>'finalTransferAmount')::numeric,
      excess_advance = (calc->>'excessAdvance')::numeric,
      event_count = (calc->>'eventCount')::integer,
      calculation = calc,
      review_required = (calc->>'reviewRequired')::boolean,
      review_reason = nullif(calc->>'reviewReason', ''),
      updated_at = now()
    where id = item.id
    returning * into item;
  else
    update public.staff_monthly_accounts set
      reimbursements_total = coalesce((calc->>'reimbursementsTotal')::numeric, 0),
      reimbursements_paid_total = coalesce((calc->>'reimbursementsPaidTotal')::numeric, 0),
      reimbursements_pending_total = coalesce((calc->>'reimbursementsPendingTotal')::numeric, 0),
      updated_at = now()
    where id = item.id
    returning * into item;
  end if;

  insert into public.staff_monthly_settlement_audit(account_id, action, actor_id, reason, state)
  values (
    item.id,
    case when inserted_count > 0 then 'GENERATED' else 'REFRESHED' end,
    auth.uid(),
    'Reconciliación canónica: trabajos realizados por fecha/estado; proyecciones futuras separadas; reembolsos fuera de honorarios.',
    calc
  );
  return item;
end;
$function$

