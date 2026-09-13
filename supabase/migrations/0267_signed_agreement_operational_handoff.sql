begin;

-- A signed agreement must prepare the existing operational contract even when
-- the commercial state is still waiting for the deposit.  This is idempotent:
-- ensure_event_operational_handoff upserts the one contract per project.
create or replace function public.sync_project_commercial_state(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  agreement_signed boolean := false;
  reservation_confirmed boolean := false;
  total numeric := 0;
  paid numeric := 0;
  required_deposit_rate numeric := 50;
  required_deposit numeric := 0;
  next_status text;
  invoice_amount numeric;
  quote_rate numeric;
  operational_result jsonb := null;
  actor uuid;
begin
  select exists(
    select 1 from public.agreements where project_id = p_project_id and status = 'SIGNED'
  ) into agreement_signed;

  select exists(
    select 1 from public.crm_reservations
    where project_id = p_project_id and status = 'CONFIRMED'
  ) into reservation_confirmed;

  select coalesce(i.amount, 0), coalesce(public.recalculate_invoice_paid_amount(i.id), 0), coalesce(q.deposit_percent, 50)
  into invoice_amount, paid, quote_rate
  from public.invoices i
  left join public.quotations q on q.id = i.quotation_id
  where i.project_id = p_project_id and i.deleted_at is null
  order by i.created_at desc
  limit 1;
  required_deposit_rate := coalesce(quote_rate, 50);

  if invoice_amount is null or invoice_amount = 0 then
    select coalesce(q.final_customer_price, q.grand_total, 0), coalesce(q.deposit_percent, 50)
    into invoice_amount, quote_rate
    from public.quotations q
    where q.project_id = p_project_id and q.deleted_at is null
    order by q.created_at desc
    limit 1;
    required_deposit_rate := coalesce(quote_rate, 50);
  end if;

  total := coalesce(invoice_amount, 0);
  paid := coalesce(paid, 0);
  required_deposit := round(total * coalesce(required_deposit_rate, 50) / 100);
  next_status := case
    when not agreement_signed then 'CONTRACT_PENDING'
    when total <= 0 or paid < required_deposit then 'WAITING_DEPOSIT'
    else 'CONFIRMED'
  end;

  -- Prepare Operations while the canonical reservation is still CONFIRMED;
  -- the commercial projection below may become AWAITING_DEPOSIT afterwards.
  if agreement_signed and reservation_confirmed then
    select coalesce(updated_by, created_by, auth.uid()) into actor
    from public.projects where id = p_project_id;
    if actor is not null then
      operational_result := public.ensure_event_operational_handoff(p_project_id, actor);
    end if;
  end if;

  update public.projects
  set status = next_status, updated_at = now()
  where id = p_project_id and deleted_at is null
    and upper(status) not in ('CANCELLED','CANCELED','ARCHIVED','PRODUCTION','EVENT','DELIVERY','CLOSED','COMPLETED');

  update public.crm_reservations
  set status = public.commercial_reservation_status(next_status), updated_at = now()
  where project_id = p_project_id and status not in ('CANCELLED', 'ARCHIVED');

  return jsonb_build_object(
    'projectId', p_project_id, 'agreementSigned', agreement_signed,
    'total', total, 'paid', paid, 'requiredDeposit', required_deposit,
    'requiredDepositRate', coalesce(required_deposit_rate, 50), 'status', next_status,
    'operationalHandoff', operational_result
  );
end $$;

drop trigger if exists agreements_refresh_commercial_state on public.agreements;
create trigger agreements_refresh_commercial_state
after insert or update of status, signed_at on public.agreements
for each row execute function public.refresh_commercial_state_from_agreement();

commit;
