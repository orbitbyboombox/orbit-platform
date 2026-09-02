begin;

-- One global, idempotent bridge from an Automatic Booking payment proof to the
-- existing Payment Ledger. It never trusts a customer-supplied amount and it
-- never creates a second document or a second movement.
create or replace function public.register_automatic_booking_deposit(
  p_project_id uuid,
  p_receipt_document_id uuid,
  p_actor_id uuid,
  p_method text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  project public.projects%rowtype;
  invoice public.invoices%rowtype;
  quote public.quotations%rowtype;
  receipt public.documents%rowtype;
  v_payment_id uuid;
  v_existing_payment_id uuid;
  deposit_amount numeric;
  ledger_paid numeric;
  stable_key text;
  receipt_filename text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Solo el pipeline seguro de reserva automática puede registrar este abono.';
  end if;

  select * into project
  from public.projects
  where id=p_project_id and deleted_at is null
  for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  if upper(coalesce(project.operations->>'reservationMethod','')) <> 'AUTOMATIC' then
    raise exception 'El evento no pertenece al flujo de reserva automática.';
  end if;
  if p_actor_id is distinct from coalesce(project.updated_by,project.created_by) then
    raise exception 'El responsable no coincide con el evento.';
  end if;

  select * into invoice
  from public.invoices
  where project_id=project.id
    and deleted_at is null
    and financial_record_state='ACTIVE'
    and record_origin='PRODUCTION'
  order by created_at desc
  limit 1
  for update;
  if not found then raise exception 'La reserva automática no tiene cuenta por cobrar activa.'; end if;

  select * into quote
  from public.quotations
  where project_id=project.id and deleted_at is null
  order by case when status='ACCEPTED' then 0 else 1 end,created_at desc
  limit 1;
  if not found then raise exception 'La reserva automática no tiene cotización canónica.'; end if;

  select * into receipt
  from public.documents
  where id=p_receipt_document_id
    and project_id=project.id
    and customer_id=project.customer_id
    and document_type='PAYMENT_RECEIPT'
    and deleted_at is null
  for update;
  if not found or nullif(trim(receipt.storage_path),'') is null
     or nullif(trim(receipt.checksum),'') is null then
    raise exception 'El comprobante canónico de la reserva automática no es válido.';
  end if;

  deposit_amount:=round(
    coalesce(quote.final_customer_price,quote.grand_total,invoice.amount,0)
    * coalesce(quote.deposit_percent,50) / 100
  );
  if deposit_amount<=0 or deposit_amount>coalesce(invoice.amount,0) then
    raise exception 'El abono canónico de la reserva automática no es válido.';
  end if;

  stable_key:='automatic-booking-deposit|'||project.id::text;
  select id into v_existing_payment_id
  from public.invoice_payments
  where invoice_id=invoice.id
    and idempotency_key=stable_key
    and deleted_at is null
  limit 1;

  ledger_paid:=coalesce(public.recalculate_invoice_paid_amount(invoice.id),0);
  if v_existing_payment_id is null and ledger_paid<>0 then
    raise exception 'La cuenta ya tiene movimientos; se requiere revisión antes de asociar el abono automático.';
  end if;

  -- The canonical movement engine requires an authenticated internal actor.
  -- This transaction-local identity is allowed only after the service-role and
  -- Event-owner checks above; it disappears when this RPC finishes.
  perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',p_actor_id,'role','authenticated')::text,
    true
  );

  v_payment_id:=public.apply_receivable_movement(
    p_invoice_id=>invoice.id,
    p_action=>'DEPOSIT',
    p_amount=>deposit_amount,
    p_occurred_at=>coalesce(receipt.created_at,now()),
    p_method=>coalesce(nullif(trim(p_method),''),'TRANSFER'),
    p_receipt_path=>null,
    p_receipt_checksum=>null,
    p_reason=>'Abono registrado desde reserva automática',
    p_idempotency_key=>stable_key
  );

  receipt_filename:=coalesce(
    nullif(trim(receipt.original_filename),''),
    regexp_replace(receipt.storage_path,'^.*/','')
  );
  update public.invoice_payments
  set receipt_path=receipt.storage_path,
      receipt_name=receipt_filename,
      updated_by=p_actor_id,
      updated_at=now()
  where id=v_payment_id;

  update public.documents
  set invoice_id=invoice.id,
      payment_id=v_payment_id,
      orbit_event_id=project.orbit_event_id,
      idempotency_key='automatic-booking-receipt|'||project.id::text,
      original_filename=receipt_filename,
      uploaded_by=coalesce(receipt.uploaded_by,p_actor_id),
      drive_sync_status=case when receipt.drive_file_id is not null then 'SYNCED' else 'PENDING' end,
      drive_synced_at=case when receipt.drive_file_id is not null then coalesce(receipt.drive_synced_at,now()) else null end,
      metadata=coalesce(receipt.metadata,'{}'::jsonb)||jsonb_build_object(
        'source','AUTOMATIC_BOOKING',
        'paymentId',v_payment_id,
        'invoiceId',invoice.id,
        'linkedAt',now()
      )
  where id=receipt.id;

  return jsonb_build_object(
    'projectId',project.id,
    'invoiceId',invoice.id,
    'paymentId',v_payment_id,
    'documentId',receipt.id,
    'amount',deposit_amount,
    'idempotencyKey',stable_key
  );
end $$;

revoke all on function public.register_automatic_booking_deposit(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.register_automatic_booking_deposit(uuid,uuid,uuid,text)
  to service_role;

commit;
