create table public.staff_archive_upload_reservations (
  document_id uuid primary key references public.staff_onboarding_documents(id) on delete cascade,
  drive_id text not null unique check (drive_id ~ '^[A-Za-z0-9_-]+$'),
  folder_id text not null,
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  file_name text not null
);

alter table public.staff_archive_upload_reservations enable row level security;
revoke all on public.staff_archive_upload_reservations from public, anon, authenticated, service_role;
grant select, insert on public.staff_archive_upload_reservations to service_role;
