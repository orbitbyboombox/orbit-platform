begin;

-- 0146: Make execute_receivable_payment_receipt_backfill schema-compatible with public.documents in Production.
-- Scope: documentation backfill helper only. No top-level data repair is executed.

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
  has_idempotency_key boolean;
  statement text;
begin
  is_service_backend :=
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or auth.role() = 'service_role';

  if not (is_service_backend or (actor is not null and public.can_administer())) then
    raise exception 'Solo Founder o Administración puede ejecutar backfill de comprobantes.';
  end if;

  select exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'documents'
      and column_name = 'idempotency_key'
  ) into has_idempotency_key;

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
        if has_idempotency_key then
          statement := format(
            'insert into public.documents(
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
              idempotency_key
            ) values (
              %L,
              %L,
              %L,
              %L,
              %L,
              %L,
              %L,
              %L,
              %L,
              %L,
              %L
            ) on conflict (idempotency_key) do nothing',
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
            'payment_receipt_backfill|' || item.payment_id::text
          );
        else
          statement := format(
            'insert into public.documents(
              invoice_id,
              payment_id,
              project_id,
              customer_id,
              orbit_event_id,
              document_type,
              storage_bucket,
              storage_path,
              checksum,
              created_by
            ) values (
              %L,
              %L,
              %L,
              %L,
              %L,
              %L,
              %L,
              %L,
              %L,
              %L
            ) on conflict (storage_path) do nothing',
            item.invoice_id,
            item.payment_id,
            item.project_id,
            item.customer_id,
            item.orbit_event_id,
            'PAYMENT_RECEIPT',
            'orbit-documents',
            item.receipt_path,
            'OPERATIONAL-FINGERPRINT:v1|backfill|' || item.payment_id::text,
            actor
          );
        end if;

        execute statement;
      end if;
    elsif item.recommendation = 'UPDATE' then
      up_count := up_count + 1;
      if not p_dry_run then
        if has_idempotency_key then
          statement := format(
            'update public.documents
               set invoice_id = %L,
                   payment_id = %L,
                   project_id = %L,
                   customer_id = %L,
                   orbit_event_id = %L,
                   storage_bucket = coalesce(storage_bucket, ''orbit-documents''),
                   document_type = coalesce(document_type, ''PAYMENT_RECEIPT''),
                   idempotency_key = coalesce(idempotency_key, %L)
             where storage_path = %L
               and storage_bucket = ''orbit-documents''
               and deleted_at is null',
            item.invoice_id,
            item.payment_id,
            item.project_id,
            item.customer_id,
            item.orbit_event_id,
            'payment_receipt_backfill|' || item.payment_id::text,
            item.receipt_path
          );
        else
          statement := format(
            'update public.documents
               set invoice_id = %L,
                   payment_id = %L,
                   project_id = %L,
                   customer_id = %L,
                   orbit_event_id = %L,
                   storage_bucket = coalesce(storage_bucket, ''orbit-documents''),
                   document_type = coalesce(document_type, ''PAYMENT_RECEIPT'')
             where storage_path = %L
               and storage_bucket = ''orbit-documents''
               and deleted_at is null',
            item.invoice_id,
            item.payment_id,
            item.project_id,
            item.customer_id,
            item.orbit_event_id,
            item.receipt_path
          );
        end if;

        execute statement;
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

revoke all on function public.preview_receivable_payment_receipt_backfill() from public,anon;
grant execute on function public.preview_receivable_payment_receipt_backfill() to authenticated;
revoke all on function public.execute_receivable_payment_receipt_backfill(boolean) from public,anon;
grant execute on function public.execute_receivable_payment_receipt_backfill(boolean) to authenticated, service_role;

commit;
