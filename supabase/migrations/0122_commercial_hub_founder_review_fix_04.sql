begin;

alter table public.commercial_documents
  add column if not exists file_size bigint,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.commercial_documents
  drop constraint if exists commercial_documents_file_size_check;
alter table public.commercial_documents
  add constraint commercial_documents_file_size_check
  check (file_size is null or (file_size > 0 and file_size <= 31457280));

update storage.buckets
set file_size_limit = greatest(coalesce(file_size_limit, 0), 52428800)
where id = 'orbit-documents';

update storage.buckets
set file_size_limit = greatest(coalesce(file_size_limit, 0), 10485760),
    allowed_mime_types = array['image/gif','image/png','image/jpeg','image/webp','image/svg+xml']::text[]
where id = 'orbit-branding';

commit;
