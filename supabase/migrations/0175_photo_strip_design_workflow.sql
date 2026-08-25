begin;

alter table public.documents
  add column if not exists version integer not null default 1,
  add column if not exists is_current boolean not null default true,
  add column if not exists workflow_status text,
  add column if not exists uploaded_by uuid references auth.users(id),
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists drive_folder_id text,
  add column if not exists drive_sync_status text,
  add column if not exists drive_sync_error text,
  add column if not exists drive_synced_at timestamptz;

alter table public.documents
  drop constraint if exists documents_version_positive_check;
alter table public.documents
  add constraint documents_version_positive_check check(version > 0);

alter table public.documents
  drop constraint if exists documents_workflow_status_check;
alter table public.documents
  add constraint documents_workflow_status_check
  check(workflow_status is null or workflow_status in('PENDING','RECEIVED','APPROVED'));

alter table public.documents
  drop constraint if exists documents_drive_sync_status_check;
alter table public.documents
  add constraint documents_drive_sync_status_check
  check(drive_sync_status is null or drive_sync_status in('PENDING','SYNCED','ERROR'));

create unique index if not exists documents_photo_strip_current_uq
  on public.documents(project_id)
  where document_type='PHOTO_STRIP_DESIGN' and is_current and deleted_at is null;

create unique index if not exists documents_photo_strip_version_uq
  on public.documents(project_id,version)
  where document_type='PHOTO_STRIP_DESIGN' and deleted_at is null;

create index if not exists documents_photo_strip_history_idx
  on public.documents(project_id,version desc)
  where document_type='PHOTO_STRIP_DESIGN' and deleted_at is null;

create or replace function public.register_photo_strip_design(
  p_document_id uuid,
  p_project_id uuid,
  p_storage_path text,
  p_checksum text,
  p_original_filename text,
  p_mime_type text,
  p_idempotency_key text
) returns table(document_id uuid,document_version integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  project_row public.projects%rowtype;
  next_version integer;
  existing public.documents%rowtype;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede subir diseños.';
  end if;
  if p_mime_type not in('application/pdf','image/jpeg','image/png') then
    raise exception 'Formato de diseño no permitido.';
  end if;
  if nullif(trim(p_original_filename),'') is null or nullif(trim(p_storage_path),'') is null then
    raise exception 'El archivo del diseño es obligatorio.';
  end if;

  select * into project_row
  from public.projects
  where id=p_project_id and deleted_at is null
  for update;
  if not found then raise exception 'Evento no encontrado.'; end if;

  select * into existing
  from public.documents
  where idempotency_key=p_idempotency_key and deleted_at is null;
  if found then
    return query select existing.id,existing.version;
    return;
  end if;

  select coalesce(max(d.version),0)+1 into next_version
  from public.documents d
  where d.project_id=p_project_id
    and d.document_type='PHOTO_STRIP_DESIGN'
    and d.deleted_at is null;

  update public.documents
  set is_current=false
  where project_id=p_project_id
    and document_type='PHOTO_STRIP_DESIGN'
    and is_current
    and deleted_at is null;

  insert into public.documents(
    id,project_id,customer_id,orbit_event_id,document_type,storage_bucket,
    storage_path,checksum,created_by,uploaded_by,idempotency_key,
    original_filename,mime_type,version,is_current,workflow_status,
    drive_sync_status,metadata
  ) values(
    p_document_id,project_row.id,project_row.customer_id,project_row.orbit_event_id,
    'PHOTO_STRIP_DESIGN','orbit-documents',p_storage_path,p_checksum,actor,actor,
    p_idempotency_key,trim(p_original_filename),p_mime_type,next_version,true,
    'RECEIVED','PENDING',jsonb_build_object(
      'source','EVENT_PHOTO_STRIP_DESIGN',
      'uploadedAt',now(),
      'uploadedBy',actor
    )
  );

  insert into public.timeline_events(
    customer_id,project_id,event_type,title,description,orbit_event_id,
    actor_id,actor_label,source,action,entity_type,entity_id,human_message,
    correlation_id,created_by
  ) values(
    project_row.customer_id,project_row.id,
    case when next_version=1 then 'PHOTO_STRIP_DESIGN_UPLOADED' else 'PHOTO_STRIP_DESIGN_UPDATED' end,
    case when next_version=1 then 'Diseño de tira de fotos recibido.' else 'Nueva versión del diseño de tira de fotos.' end,
    format('Versión %s · %s',next_version,trim(p_original_filename)),project_row.orbit_event_id,
    actor,'Administrador','Administrator',
    case when next_version=1 then 'PHOTO_STRIP_DESIGN_UPLOADED' else 'PHOTO_STRIP_DESIGN_UPDATED' end,
    'Document',p_document_id,
    format('Diseño de tira de fotos V%s recibido.',next_version),gen_random_uuid(),actor
  );

  return query select p_document_id,next_version;
end $$;

create or replace function public.approve_photo_strip_design(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  item public.documents%rowtype;
  event_code text;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede aprobar diseños.';
  end if;
  select * into item from public.documents
  where id=p_document_id
    and document_type='PHOTO_STRIP_DESIGN'
    and is_current
    and deleted_at is null
  for update;
  if not found then raise exception 'El diseño actual no está disponible.'; end if;

  update public.documents
  set workflow_status='APPROVED',approved_by=actor,approved_at=now()
  where id=item.id;

  select orbit_event_id into event_code from public.projects where id=item.project_id;
  insert into public.timeline_events(
    customer_id,project_id,event_type,title,description,orbit_event_id,
    actor_id,actor_label,source,action,entity_type,entity_id,human_message,
    correlation_id,created_by
  ) values(
    item.customer_id,item.project_id,'PHOTO_STRIP_DESIGN_APPROVED',
    'Diseño de tira de fotos aprobado.',format('Versión %s aprobada.',item.version),event_code,
    actor,'Administrador','Administrator','PHOTO_STRIP_DESIGN_APPROVED',
    'Document',item.id,format('Diseño de tira de fotos V%s aprobado.',item.version),
    gen_random_uuid(),actor
  );
  return item.id;
end $$;

comment on column public.documents.workflow_status is 'Operational document workflow; PHOTO_STRIP_DESIGN uses RECEIVED or APPROVED.';
comment on column public.documents.is_current is 'Current protected version within a versioned document workflow.';
comment on function public.register_photo_strip_design is 'Atomically registers the next canonical PHOTO_STRIP_DESIGN version without sending customer communications.';

commit;
