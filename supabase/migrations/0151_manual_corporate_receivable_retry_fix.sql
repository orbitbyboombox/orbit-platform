begin;

-- Forward-only correction for the post-0140 commercial-state trigger. The
-- canonical quotations schema exposes final_customer_price and grand_total;
-- it has never guaranteed a legacy total column.
create or replace function public.sync_project_commercial_state(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  agreement_signed boolean := false;
  total numeric := 0;
  paid numeric := 0;
  required_deposit_rate numeric := 50;
  required_deposit numeric := 0;
  next_status text;
  invoice_amount numeric;
  quote_rate numeric;
begin
  select exists(
    select 1 from agreements where project_id = p_project_id and status = 'SIGNED'
  ) into agreement_signed;

  select coalesce(i.amount, 0), coalesce(public.recalculate_invoice_paid_amount(i.id), 0), coalesce(q.deposit_percent, 50)
  into invoice_amount, paid, quote_rate
  from invoices i
  left join quotations q on q.id = i.quotation_id
  where i.project_id = p_project_id and i.deleted_at is null
  order by i.created_at desc
  limit 1;
  required_deposit_rate := coalesce(quote_rate, 50);

  if invoice_amount is null or invoice_amount = 0 then
    select coalesce(q.final_customer_price, q.grand_total, 0), coalesce(q.deposit_percent, 50)
    into invoice_amount, quote_rate
    from quotations q
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
    'requiredDepositRate', coalesce(required_deposit_rate, 50), 'status', next_status
  );
end $$;

revoke all on function public.sync_project_commercial_state(uuid) from public,anon;
grant execute on function public.sync_project_commercial_state(uuid) to authenticated,service_role;

commit;
