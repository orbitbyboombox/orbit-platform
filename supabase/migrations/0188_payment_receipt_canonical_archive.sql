begin;

-- Attach or retry a receipt for an existing Payment Ledger movement. This RPC
-- deliberately does not insert/delete payments, recalculate balances, or touch
-- receivable movements. Storage is written first by the server action and this
-- transaction only establishes the canonical document relationship.
create or replace function public.attach_receivable_payment_receipt(
  p_invoice_id uuid,
  p_payment_id uuid,
  p_storage_path text,
  p_receipt_name text,
  p_receipt_checksum text,
  p_mime_type text,
  p_file_size bigint
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  inv public.invoices%rowtype;
  payment public.invoice_payments%rowtype;
  current_document public.documents%rowtype;
  document_id uuid;
  has_current_document boolean:=false;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede adjuntar comprobantes.';
  end if;
  if nullif(trim(p_storage_path),'') is null
     or nullif(trim(p_receipt_name),'') is null
     or nullif(trim(p_receipt_checksum),'') is null
     or p_mime_type not in ('image/jpeg','image/png','image/webp','application/pdf')
     or coalesce(p_file_size,0)<=0 then
    raise exception 'El comprobante no es válido.';
  end if;

  select * into inv
  from public.invoices
  where id=p_invoice_id and deleted_at is null
  for update;
  if not found then raise exception 'Cuenta por cobrar no encontrada.'; end if;

  select * into payment
  from public.invoice_payments
  where id=p_payment_id and invoice_id=inv.id and deleted_at is null
  for update;
  if not found then raise exception 'Movimiento de pago no encontrado.'; end if;

  select * into current_document
  from public.documents
  where payment_id=payment.id
    and document_type='PAYMENT_RECEIPT'
    and deleted_at is null
  order by created_at desc
  limit 1
  for update;
  has_current_document:=found;

  update public.invoice_payments
  set receipt_path=trim(p_storage_path),
      receipt_name=trim(p_receipt_name),
      updated_at=now(),
      updated_by=actor
  where id=payment.id;

  if has_current_document then
    update public.documents
    set invoice_id=inv.id,
        project_id=inv.project_id,
        customer_id=inv.customer_id,
        orbit_event_id=inv.orbit_event_id,
        storage_bucket='orbit-documents',
        storage_path=trim(p_storage_path),
        checksum=trim(p_receipt_checksum),
        original_filename=trim(p_receipt_name),
        mime_type=p_mime_type,
        file_size=p_file_size,
        uploaded_by=actor,
        drive_file_id=case
          when current_document.checksum=trim(p_receipt_checksum) then current_document.drive_file_id
          else null
        end,
        drive_folder_id=case
          when current_document.checksum=trim(p_receipt_checksum) then current_document.drive_folder_id
          else null
        end,
        drive_sync_status=case
          when current_document.checksum=trim(p_receipt_checksum) and current_document.drive_file_id is not null then 'SYNCED'
          else 'PENDING'
        end,
        drive_sync_error=null,
        drive_synced_at=case
          when current_document.checksum=trim(p_receipt_checksum) then current_document.drive_synced_at
          else null
        end,
        metadata=coalesce(current_document.metadata,'{}'::jsonb)||jsonb_build_object(
          'source','PAYMENT_LEDGER_DOCUMENT_RETRY',
          'paymentId',payment.id,
          'invoiceId',inv.id,
          'uploadedAt',now(),
          'uploadedBy',actor
        )
    where id=current_document.id
    returning id into document_id;
  else
    insert into public.documents(
      invoice_id,payment_id,project_id,customer_id,orbit_event_id,document_type,
      storage_bucket,storage_path,checksum,created_by,uploaded_by,idempotency_key,
      original_filename,mime_type,file_size,drive_sync_status,metadata
    ) values (
      inv.id,payment.id,inv.project_id,inv.customer_id,inv.orbit_event_id,'PAYMENT_RECEIPT',
      'orbit-documents',trim(p_storage_path),trim(p_receipt_checksum),actor,actor,
      'payment_receipt_current|'||payment.id::text,trim(p_receipt_name),p_mime_type,
      p_file_size,'PENDING',jsonb_build_object(
        'source','PAYMENT_LEDGER_DOCUMENT_RETRY',
        'paymentId',payment.id,
        'invoiceId',inv.id,
        'uploadedAt',now(),
        'uploadedBy',actor
      )
    )
    on conflict (idempotency_key) do update set
      invoice_id=excluded.invoice_id,
      payment_id=excluded.payment_id,
      project_id=excluded.project_id,
      customer_id=excluded.customer_id,
      orbit_event_id=excluded.orbit_event_id,
      storage_bucket=excluded.storage_bucket,
      storage_path=excluded.storage_path,
      checksum=excluded.checksum,
      original_filename=excluded.original_filename,
      mime_type=excluded.mime_type,
      file_size=excluded.file_size,
      uploaded_by=excluded.uploaded_by,
      drive_sync_status='PENDING',
      drive_sync_error=null,
      metadata=excluded.metadata
    returning id into document_id;
  end if;

  insert into public.timeline_events(
    customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,
    actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by
  ) values (
    inv.customer_id,inv.project_id,inv.orbit_event_id,'PAYMENT_RECEIPT_ATTACHED',
    'Comprobante de pago adjuntado',trim(p_receipt_name),actor,'Founder','Payment Ledger',
    'PAYMENT_RECEIPT_ATTACHED','Document',document_id,
    'El comprobante fue adjuntado al movimiento existente sin modificar el pago.',
    'payment-receipt:'||payment.id::text||':'||trim(p_receipt_checksum),actor
  ) on conflict (correlation_id) do nothing;

  return document_id;
end $$;

revoke all on function public.attach_receivable_payment_receipt(uuid,uuid,text,text,text,text,bigint) from public,anon;
grant execute on function public.attach_receivable_payment_receipt(uuid,uuid,text,text,text,text,bigint) to authenticated;

commit;
