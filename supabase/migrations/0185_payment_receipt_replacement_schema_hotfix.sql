begin;

-- Global replacement path for a receipt on an existing Payment Ledger movement.
-- The canonical documents table has created_by/created_at but no update audit
-- columns. This function inserts the missing reference or updates the one owned
-- by the exact payment; it never creates another financial movement.
create or replace function public.manage_receivable_payment(
  p_invoice_id uuid,
  p_payment_id uuid,
  p_action text,
  p_amount numeric,
  p_paid_at timestamptz,
  p_method text,
  p_receipt_path text,
  p_reason text
) returns void language plpgsql security definer set search_path=public as $$
declare
  actor uuid := auth.uid();
  inv invoices%rowtype;
  payment invoice_payments%rowtype;
  action text := upper(trim(p_action));
  normalized_reason text := trim(coalesce(p_reason, ''));
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede gestionar movimientos.';
  end if;
  if action not in ('EDIT', 'DELETE') then raise exception 'Acción de movimiento no válida.'; end if;
  if length(normalized_reason) < 3 then raise exception 'El motivo es obligatorio.'; end if;

  select * into inv from invoices where id=p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Cuenta por cobrar no encontrada.'; end if;
  select * into payment from invoice_payments where id=p_payment_id and invoice_id=p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Movimiento de pago no encontrado.'; end if;

  insert into public.receivable_movement_revisions(
    invoice_id,payment_id,action,original_amount,new_amount,original_date,new_date,
    original_method,new_method,original_receipt_path,new_receipt_path,reason,actor_id
  ) values (
    inv.id,payment.id,action,payment.amount,case when action='EDIT' then p_amount end,
    payment.paid_at,case when action='EDIT' then p_paid_at end,payment.method,
    case when action='EDIT' then coalesce(nullif(trim(p_method),''),payment.method) end,
    payment.receipt_path,case when action='EDIT' then coalesce(nullif(trim(p_receipt_path),''),payment.receipt_path) end,
    normalized_reason,actor
  );

  if action='EDIT' then
    if p_amount is null or p_amount=0 or p_paid_at is null or length(trim(coalesce(p_method,'')))=0 then
      raise exception 'Monto, fecha y método son obligatorios.';
    end if;
    update public.invoice_payments set
      amount=p_amount,paid_at=p_paid_at,method=trim(p_method),
      receipt_path=coalesce(nullif(trim(p_receipt_path),''),receipt_path),
      reason=normalized_reason,updated_at=now(),updated_by=actor
    where id=payment.id;
  else
    update public.invoice_payments set deleted_at=now(),deleted_by=actor,updated_at=now(),updated_by=actor
    where id=payment.id;
  end if;

  perform public.sync_invoice_financial_state(inv.id,actor,normalized_reason);

  if action='EDIT' and nullif(trim(p_receipt_path),'') is not null then
    update public.documents set
      payment_id=payment.id,invoice_id=inv.id,project_id=inv.project_id,
      customer_id=inv.customer_id,orbit_event_id=inv.orbit_event_id,
      document_type='PAYMENT_RECEIPT',storage_bucket='orbit-documents',
      storage_path=trim(p_receipt_path),
      checksum='OPERATIONAL-FINGERPRINT:v1|payment-edit|'||payment.id::text||'|'||trim(p_receipt_path)
    where payment_id=payment.id
       or (payment_id is null and invoice_id=inv.id and storage_path=payment.receipt_path);

    if not found then
      insert into public.documents(
        invoice_id,payment_id,project_id,customer_id,orbit_event_id,
        document_type,storage_bucket,storage_path,checksum,created_by,idempotency_key
      ) values (
        inv.id,payment.id,inv.project_id,inv.customer_id,inv.orbit_event_id,
        'PAYMENT_RECEIPT','orbit-documents',trim(p_receipt_path),
        'OPERATIONAL-FINGERPRINT:v1|payment-edit|'||payment.id::text||'|'||trim(p_receipt_path),
        actor,'payment_receipt_current|'||payment.id::text
      ) on conflict (idempotency_key) do update set
        invoice_id=excluded.invoice_id,payment_id=excluded.payment_id,
        project_id=excluded.project_id,customer_id=excluded.customer_id,
        orbit_event_id=excluded.orbit_event_id,document_type=excluded.document_type,
        storage_bucket=excluded.storage_bucket,storage_path=excluded.storage_path,
        checksum=excluded.checksum;
    end if;
  end if;

  insert into public.timeline_events(
    customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,
    actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by
  ) values (
    inv.customer_id,inv.project_id,inv.orbit_event_id,'PAYMENT_MOVEMENT_'||action,
    case when action='EDIT' then 'Movimiento de pago corregido' else 'Movimiento de pago eliminado' end,
    normalized_reason,actor,'Founder','Administrator','PAYMENT_MOVEMENT_'||action,
    'InvoicePayment',payment.id,
    case when action='EDIT' then 'El movimiento fue actualizado y los saldos fueron recalculados.'
         else 'El movimiento fue eliminado de la operación activa y los saldos fueron recalculados.' end,
    'payment-management:'||gen_random_uuid(),normalized_reason,actor
  );

  perform public.sync_financial_event(inv.project_id);
  perform public.sync_event_profitability(inv.project_id);
end $$;

revoke all on function public.manage_receivable_payment(uuid,uuid,text,numeric,timestamptz,text,text,text) from public,anon;
grant execute on function public.manage_receivable_payment(uuid,uuid,text,numeric,timestamptz,text,text,text) to authenticated;

commit;
