begin;

create unique index if not exists documents_event_digital_template_current_uq
  on public.documents(project_id)
  where document_type='EVENT_DIGITAL_PHOTO_TEMPLATE' and is_current and deleted_at is null;

create unique index if not exists documents_event_digital_template_version_uq
  on public.documents(project_id,version)
  where document_type='EVENT_DIGITAL_PHOTO_TEMPLATE' and deleted_at is null;

create index if not exists documents_event_digital_template_history_idx
  on public.documents(project_id,version desc)
  where document_type='EVENT_DIGITAL_PHOTO_TEMPLATE' and deleted_at is null;

create or replace function public.register_event_digital_photo_template(
  p_document_id uuid,
  p_project_id uuid,
  p_storage_path text,
  p_checksum text,
  p_original_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_idempotency_key text,
  p_uploaded_by uuid
) returns table(document_id uuid, document_version integer)
language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); project_row public.projects%rowtype; next_version integer; existing public.documents%rowtype;
begin
  if actor is null or p_uploaded_by is distinct from actor or not public.can_administer() then raise exception 'Solo Founder o Administración puede subir el template.'; end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png') then raise exception 'Formato de template no permitido.'; end if;
  if p_file_size is null or p_file_size <= 0 or p_file_size > 20*1024*1024 then raise exception 'El template supera el tamaño máximo permitido.'; end if;
  if nullif(trim(p_original_filename),'') is null or nullif(trim(p_storage_path),'') is null then raise exception 'El archivo del template es obligatorio.'; end if;
  select * into project_row from public.projects where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  select * into existing from public.documents where idempotency_key=p_idempotency_key and document_type='EVENT_DIGITAL_PHOTO_TEMPLATE' and deleted_at is null;
  if found then return query select existing.id,existing.version; return; end if;
  select coalesce(max(version),0)+1 into next_version from public.documents where project_id=p_project_id and document_type='EVENT_DIGITAL_PHOTO_TEMPLATE' and deleted_at is null;
  update public.documents set is_current=false where project_id=p_project_id and document_type='EVENT_DIGITAL_PHOTO_TEMPLATE' and is_current and deleted_at is null;
  insert into public.documents(id,project_id,customer_id,orbit_event_id,document_type,storage_bucket,storage_path,checksum,created_by,uploaded_by,idempotency_key,original_filename,mime_type,file_size,version,is_current,workflow_status,operational_for_staff,drive_sync_status,metadata)
  values(p_document_id,project_row.id,project_row.customer_id,project_row.orbit_event_id,'EVENT_DIGITAL_PHOTO_TEMPLATE','orbit-documents',p_storage_path,p_checksum,actor,actor,p_idempotency_key,trim(p_original_filename),p_mime_type,p_file_size,next_version,true,'RECEIVED',true,'PENDING',jsonb_build_object('source','EVENT_DIGITAL_PHOTO_TEMPLATE','uploadedAt',now(),'uploadedBy',actor,'fileSize',p_file_size));
  insert into public.timeline_events(customer_id,project_id,event_type,title,description,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by)
  values(project_row.customer_id,project_row.id,case when next_version=1 then 'EVENT_DIGITAL_PHOTO_TEMPLATE_UPLOADED' else 'EVENT_DIGITAL_PHOTO_TEMPLATE_UPDATED' end,case when next_version=1 then 'Template digital de fotografías recibido.' else 'Nueva versión del template digital de fotografías.' end,format('Versión %s · %s',next_version,trim(p_original_filename)),project_row.orbit_event_id,actor,'Administrador','Administrator',case when next_version=1 then 'EVENT_DIGITAL_PHOTO_TEMPLATE_UPLOADED' else 'EVENT_DIGITAL_PHOTO_TEMPLATE_UPDATED' end,'Document',p_document_id,format('Template digital V%s recibido.',next_version),gen_random_uuid(),actor);
  return query select p_document_id,next_version;
end $$;

revoke all on function public.register_event_digital_photo_template(uuid,uuid,text,text,text,text,bigint,text,uuid) from public;
grant execute on function public.register_event_digital_photo_template(uuid,uuid,text,text,text,text,bigint,text,uuid) to authenticated;
comment on function public.register_event_digital_photo_template is 'Registers versioned private event photo templates independently from PHOTO_STRIP_DESIGN.';

commit;
