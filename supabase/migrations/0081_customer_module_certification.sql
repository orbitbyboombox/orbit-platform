begin;

create or replace function public.replace_crm_document(p_document_id uuid,p_storage_path text,p_checksum text,p_drive_file_id text,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); current_document documents%rowtype; replacement_id uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede reemplazar documentos.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'El motivo es obligatorio.'; end if;
  select * into current_document from documents where id=p_document_id and deleted_at is null for update;
  if not found then raise exception 'Documento no encontrado.'; end if;
  insert into documents(project_id,customer_id,document_type,storage_bucket,storage_path,checksum,drive_file_id,created_by)
  values(current_document.project_id,current_document.customer_id,current_document.document_type,'orbit-documents',p_storage_path,p_checksum,nullif(p_drive_file_id,''),actor)
  returning id into replacement_id;
  update documents set deleted_at=now() where id=current_document.id;
  insert into timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  select current_document.customer_id,current_document.project_id,p.orbit_event_id,'CRM_DOCUMENT_REPLACED','Documento oficial reemplazado',trim(p_reason),actor,'Founder','Administrator','CRM_DOCUMENT_REPLACED','Document',replacement_id,'El documento oficial fue reemplazado desde el Perfil del Cliente.','crm-document:'||replacement_id,trim(p_reason),actor from projects p where p.id=current_document.project_id and p.orbit_event_id is not null;
  return replacement_id;
end $$;
revoke all on function public.replace_crm_document(uuid,text,text,text,text) from public,anon;
grant execute on function public.replace_crm_document(uuid,text,text,text,text) to authenticated;

commit;
