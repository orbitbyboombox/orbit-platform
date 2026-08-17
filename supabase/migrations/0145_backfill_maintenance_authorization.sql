-- 0145: Backfill maintenance authorization fix
create or replace function public.execute_receivable_payment_receipt_backfill(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor uuid := auth.uid();
  is_service_backend boolean;
  item record;
  ins_count integer := 0;
  up_count integer := 0;
  unchanged integer := 0;
  total integer := 0;
begin
  is_service_backend :=
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or auth.role() = 'service_role';

  if not (is_service_backend or (actor is not null and public.can_administer())) then
    raise exception 'Solo Founder o Administración puede ejecutar backfill de comprobantes.';
  end if;

  for item in
    select * from public.preview_receivable_payment_receipt_backfill()
  loop
    total := total + 1;
    if not item.has_storage_object then
      continue;
    end if;

    if item.recommendation = 'INSERT' then
      ins_count := ins_count + 1;
      if not p_dry_run then
        insert into public.documents(
          invoice_id,
          payment_id,
          project_id,
          customer_id,
          orbit_event_id,
          document_type,
          storage_bucket,
          storage_path,
          checksum,
          created_by,
          updated_by,
          idempotency_key
        ) values (
          item.invoice_id,
          item.payment_id,
          item.project_id,
          item.customer_id,
          item.orbit_event_id,
          'PAYMENT_RECEIPT',
          'orbit-documents',
          item.receipt_path,
          'OPERATIONAL-FINGERPRINT:v1|backfill|' || item.payment_id::text,
          actor,
          actor,
          'payment_receipt_backfill|' || item.payment_id::text
        )
        on conflict (idempotency_key) do nothing;
      end if;
    elsif item.recommendation = 'UPDATE' then
      up_count := up_count + 1;
      if not p_dry_run then
        update public.documents
        set invoice_id = item.invoice_id,
            payment_id = item.payment_id,
            project_id = item.project_id,
            customer_id = item.customer_id,
            orbit_event_id = item.orbit_event_id,
            storage_bucket = coalesce(documents.storage_bucket, 'orbit-documents'),
            document_type = coalesce(documents.document_type, 'PAYMENT_RECEIPT'),
            updated_by = actor,
            updated_at = now(),
            idempotency_key = coalesce(documents.idempotency_key, 'payment_receipt_backfill|' || item.payment_id::text)
        where storage_path = item.receipt_path
          and documents.storage_bucket = 'orbit-documents'
          and documents.deleted_at is null;
      end if;
    else
      unchanged := unchanged + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'total_scanned', total,
    'to_insert', ins_count,
    'to_update', up_count,
    'unchanged', unchanged,
    'dry_run', coalesce(p_dry_run, true)
  );
end $$;

revoke all on function public.execute_receivable_payment_receipt_backfill(boolean) from public,anon;
grant execute on function public.execute_receivable_payment_receipt_backfill(boolean) to authenticated, service_role;
