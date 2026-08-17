-- HOTFIX 0141:
-- Resolve PostgREST `PGRST203` by keeping both call paths explicit.
-- - legacy SQL caller: 7 positional args (existing behavior)
-- - canonical REST/RPC caller: 9 args with checksum + idempotency key
-- Keep it minimal and deterministic:
--   1) drop canonical 9-arg overload with exact signature (no defaults)
--   2) recreate canonical 9-arg overload
--   3) keep legacy 7-arg wrapper untouched (from 0140)

DROP FUNCTION IF EXISTS public.register_receivable_payment(
  uuid,
  numeric,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text
);

create function public.register_receivable_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_paid_at timestamptz,
  p_method text,
  p_receipt_path text,
  p_receipt_name text,
  p_observation text,
  p_receipt_checksum text,
  p_idempotency_key text
) returns uuid language plpgsql security definer set search_path=public as $f$
declare
  actor uuid := auth.uid();
  payment_id uuid;
  note text := coalesce(nullif(trim(p_observation), ''), 'Pago registrado desde Perfil del Cliente');
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede registrar pagos.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;

  if p_paid_at is null or length(trim(coalesce(p_method, ''))) = 0 then
    raise exception 'Fecha y método son obligatorios.';
  end if;

  payment_id := public.apply_receivable_movement(
    p_invoice_id => p_invoice_id,
    p_action => 'PARTIAL_PAYMENT',
    p_amount => p_amount,
    p_occurred_at => p_paid_at,
    p_method => p_method,
    p_receipt_path => p_receipt_path,
    p_receipt_checksum => p_receipt_checksum,
    p_reason => note,
    p_idempotency_key => p_idempotency_key
  );

  if p_receipt_name is not null and trim(p_receipt_name) <> '' then
    update public.invoice_payments
    set receipt_name = trim(p_receipt_name)
    where id = payment_id;
  end if;

  return payment_id;
end
$f$;

revoke all on function public.register_receivable_payment(uuid,numeric,timestamptz,text,text,text,text) from public,anon;
grant execute on function public.register_receivable_payment(uuid,numeric,timestamptz,text,text,text,text) to authenticated;
revoke all on function public.register_receivable_payment(uuid,numeric,timestamptz,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_receivable_payment(uuid,numeric,timestamptz,text,text,text,text,text,text) to authenticated;
