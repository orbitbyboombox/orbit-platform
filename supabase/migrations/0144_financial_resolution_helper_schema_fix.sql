begin;

-- 0144 Financial Resolution Helper Schema Fix
-- Scope: fix production incompatibility by removing non-existent invoice_payments.metadata writes.
-- This migration keeps technical-resolution metadata in receivable_movements only.
-- No automatic data repair is executed.

create or replace function public.mark_return_pending_technical_resolution(
  p_movement_id uuid,
  p_actor_id uuid,
  p_resolution_reason text,
  p_source_payment_id uuid,
  p_applies_cash_impact boolean default false
) returns void
language plpgsql
security definer
set search_path=public as $$
declare
  v_invoice_id uuid;
  v_reference text;
  v_source_payment_id uuid;
begin
  select rm.invoice_id, rm.reference
    into v_invoice_id, v_reference
  from public.receivable_movements rm
  where rm.id = p_movement_id
    and rm.movement_type = 'RETURN_PENDING';

  v_source_payment_id := p_source_payment_id;

  if v_source_payment_id is null then
    if v_reference ~* '^[0-9a-fA-F-]{36}$' then
      begin
        select ip.id
          into v_source_payment_id
        from public.invoice_payments ip
        where ip.id = v_reference::uuid
          and ip.invoice_id = v_invoice_id
        limit 1;
      exception
        when invalid_text_representation then
          v_source_payment_id := null;
      end;
    end if;
  end if;

  update public.receivable_movements
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'technicalResolution', jsonb_build_object(
      'status', 'RESOLVED_TECHNICAL',
      'appliesCashImpact', p_applies_cash_impact,
      'resolutionReason', coalesce(nullif(trim(p_resolution_reason), ''), 'Error de tipeo'),
      'resolvedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'resolvedBy', p_actor_id::text,
      'sourcePaymentId', v_source_payment_id::text,
      'sourceMovementId', p_movement_id::text
    )
  )
  where id = p_movement_id
    and movement_type = 'RETURN_PENDING'
    and coalesce(upper(metadata -> 'technicalResolution' ->> 'status'), '') <> 'RESOLVED_TECHNICAL';

  if found then
    return;
  end if;
end
$$;

commit;
