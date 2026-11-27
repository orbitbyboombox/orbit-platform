create or replace function public.enqueue_external_tax_pdf_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tributary_drive_sync_items (
    document_id, project_id, customer_id, artifact_kind, idempotency_key, status, checksum
  ) values (
    new.id, new.project_id, new.customer_id, 'PDF',
    'document:' || new.id::text || ':central:PDF', 'PENDING', new.checksum
  ) on conflict (idempotency_key) do nothing;
  return new;
end;
$$;

revoke execute on function public.enqueue_external_tax_pdf_archive() from public, anon, authenticated;

drop trigger if exists enqueue_external_tax_pdf_archive on public.documents;
create trigger enqueue_external_tax_pdf_archive
after insert or update of drive_file_id, document_type, mime_type, project_id, customer_id, external_issue_date, external_tax_document_type, deleted_at on public.documents
for each row
when (
  new.document_type = 'EXTERNAL_TAX_DOCUMENT'
  and new.mime_type = 'application/pdf'
  and new.drive_file_id is not null
  and new.project_id is not null
  and new.customer_id is not null
  and new.external_issue_date is not null
  and new.external_tax_document_type is not null
  and new.deleted_at is null
)
execute function public.enqueue_external_tax_pdf_archive();
