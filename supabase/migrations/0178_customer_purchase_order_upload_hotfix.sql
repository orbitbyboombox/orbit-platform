begin;

alter table public.documents
  add column if not exists file_size bigint;

alter table public.documents
  drop constraint if exists documents_file_size_positive_check;
alter table public.documents
  add constraint documents_file_size_positive_check
  check(file_size is null or file_size > 0);

drop function if exists public.register_customer_purchase_order(uuid,uuid,text,text,text,text,text,text);

create or replace function public.register_customer_purchase_order(
  p_document_id uuid,
  p_project_id uuid,
  p_purchase_order_number text,
  p_storage_path text,
  p_checksum text,
  p_original_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  project_row public.projects%rowtype;
  existing_id uuid;
  previous_id uuid;
  next_version integer;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede adjuntar una OC.';
  end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png') then
    raise exception 'Formato no permitido. Usa PDF, JPG o PNG.';
  end if;
  if p_file_size is null or p_file_size <= 0 or p_file_size > 20*1024*1024 then
    raise exception 'El tamaño de la OC no es válido.';
  end if;
  if nullif(trim(p_original_filename),'') is null
    or nullif(trim(p_storage_path),'') is null
    or nullif(trim(p_idempotency_key),'') is null then
    raise exception 'Faltan datos del archivo de la OC.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text,0));

  select id into existing_id
  from public.documents
  where idempotency_key=p_idempotency_key and deleted_at is null;
  if existing_id is not null then return existing_id; end if;

  select * into project_row
  from public.projects
  where id=p_project_id and deleted_at is null
  for update;
  if not found then raise exception 'Evento no encontrado.'; end if;

  select id into previous_id
  from public.documents
  where project_id=project_row.id
    and document_type='CUSTOMER_PURCHASE_ORDER'
    and deleted_at is null
  for update;

  select coalesce(max(version),0)+1 into next_version
  from public.documents
  where project_id=project_row.id
    and document_type='CUSTOMER_PURCHASE_ORDER';

  if previous_id is not null then
    update public.documents set
      deleted_at=now(),
      is_current=false,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'replacedBy',p_document_id,
        'replacedAt',now(),
        'replacedByUser',actor
      )
    where id=previous_id;
  end if;

  insert into public.documents(
    id,project_id,customer_id,orbit_event_id,document_type,storage_bucket,
    storage_path,checksum,created_by,uploaded_by,idempotency_key,
    purchase_order_number,original_filename,mime_type,file_size,
    replaced_document_id,version,is_current,workflow_status,
    drive_sync_status,metadata
  ) values(
    p_document_id,project_row.id,project_row.customer_id,project_row.orbit_event_id,
    'CUSTOMER_PURCHASE_ORDER','orbit-documents',p_storage_path,p_checksum,
    actor,actor,p_idempotency_key,nullif(trim(p_purchase_order_number),''),
    trim(p_original_filename),p_mime_type,p_file_size,previous_id,next_version,true,
    'RECEIVED','PENDING',jsonb_build_object(
      'source','FOUNDER_UPLOAD',
      'protected',true,
      'uploadedAt',now(),
      'uploadedBy',actor,
      'fileSize',p_file_size,
      'driveArchiveStatus','PENDING'
    )
  );

  insert into public.timeline_events(
    customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,
    actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by
  ) values(
    project_row.customer_id,project_row.id,project_row.orbit_event_id,
    'CUSTOMER_PURCHASE_ORDER_ATTACHED','OC Cliente adjuntada',
    coalesce('OC '||nullif(trim(p_purchase_order_number),''),'Documento sin número'),
    actor,'Founder','Administrator','CUSTOMER_PURCHASE_ORDER_ATTACHED','Document',p_document_id,
    case when previous_id is null
      then 'OC Cliente adjuntada.'
      else 'OC Cliente reemplazada conservando el historial protegido.'
    end,
    'customer-purchase-order:'||p_document_id::text,actor
  );

  return p_document_id;
end;
$$;

revoke all on function public.register_customer_purchase_order(uuid,uuid,text,text,text,text,text,bigint,text) from public,anon;
grant execute on function public.register_customer_purchase_order(uuid,uuid,text,text,text,text,text,bigint,text) to authenticated;

comment on function public.register_customer_purchase_order(uuid,uuid,text,text,text,text,text,bigint,text) is
'Atomically registers one current protected Customer Purchase Order. Timeline uses the canonical Administrator source; Drive remains a retryable administrative archive.';
comment on column public.documents.file_size is
'Original protected document size in bytes when supplied by the owning upload workflow.';

commit;
