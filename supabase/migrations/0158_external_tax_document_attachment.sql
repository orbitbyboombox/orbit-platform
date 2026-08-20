begin;

alter table public.documents
  add column if not exists external_tax_document_type text,
  add column if not exists external_folio text,
  add column if not exists external_issue_date date,
  add column if not exists external_customer_name text,
  add column if not exists external_customer_tax_id text,
  add column if not exists external_net_amount numeric(14,2),
  add column if not exists external_tax_amount numeric(14,2),
  add column if not exists external_total_amount numeric(14,2),
  add column if not exists external_document_status text,
  add column if not exists original_filename text,
  add column if not exists mime_type text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.documents drop constraint if exists documents_external_tax_type_check;
alter table public.documents add constraint documents_external_tax_type_check
  check (external_tax_document_type is null or external_tax_document_type in ('FACTURA','BOLETA','NOTA_CREDITO','NOTA_DEBITO'));
alter table public.documents drop constraint if exists documents_external_tax_status_check;
alter table public.documents add constraint documents_external_tax_status_check
  check (external_document_status is null or external_document_status in ('PENDIENTE_DOCUMENTO','ADJUNTADO','REQUIERE_REVISION'));
alter table public.documents drop constraint if exists documents_external_tax_amounts_check;
alter table public.documents add constraint documents_external_tax_amounts_check
  check (
    external_net_amount is null or (
      external_net_amount >= 0 and external_tax_amount >= 0 and external_total_amount >= 0
      and external_net_amount + external_tax_amount = external_total_amount
    )
  );

create unique index if not exists documents_external_tax_checksum_uq
  on public.documents(checksum)
  where external_tax_document_type is not null and deleted_at is null;
create unique index if not exists documents_external_tax_folio_uq
  on public.documents(external_tax_document_type, upper(external_folio), regexp_replace(upper(external_customer_tax_id), '[^0-9K]', '', 'g'))
  where external_tax_document_type is not null and deleted_at is null;
create index if not exists documents_external_tax_project_idx
  on public.documents(project_id, external_issue_date desc)
  where external_tax_document_type is not null and deleted_at is null;

create or replace function public.register_external_tax_document(
  p_document_id uuid,
  p_project_id uuid,
  p_invoice_id uuid,
  p_tax_type text,
  p_folio text,
  p_issue_date date,
  p_customer_name text,
  p_customer_tax_id text,
  p_net_amount numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_observation text,
  p_storage_path text,
  p_checksum text,
  p_drive_file_id text,
  p_original_filename text,
  p_mime_type text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  project_row public.projects%rowtype;
  existing_id uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede adjuntar documentos tributarios.'; end if;
  if p_tax_type not in ('FACTURA','BOLETA','NOTA_CREDITO','NOTA_DEBITO') then raise exception 'Tipo tributario no válido.'; end if;
  if nullif(trim(p_folio),'') is null or p_issue_date is null then raise exception 'Folio y fecha de emisión son obligatorios.'; end if;
  if p_net_amount < 0 or p_tax_amount < 0 or p_total_amount < 0 or p_net_amount + p_tax_amount <> p_total_amount then raise exception 'Los montos del documento no reconcilian.'; end if;
  select * into project_row from public.projects where id=p_project_id and deleted_at is null;
  if not found then raise exception 'Evento no encontrado.'; end if;
  if p_invoice_id is not null and not exists(select 1 from public.invoices where id=p_invoice_id and project_id=p_project_id and deleted_at is null) then raise exception 'La factura ORBIT no corresponde al Evento.'; end if;
  select id into existing_id from public.documents where idempotency_key=p_idempotency_key and deleted_at is null;
  if existing_id is not null then return existing_id; end if;

  insert into public.documents(id,project_id,customer_id,invoice_id,orbit_event_id,document_type,storage_bucket,storage_path,checksum,drive_file_id,created_by,idempotency_key,external_tax_document_type,external_folio,external_issue_date,external_customer_name,external_customer_tax_id,external_net_amount,external_tax_amount,external_total_amount,external_document_status,original_filename,mime_type,metadata)
  values(p_document_id,p_project_id,project_row.customer_id,p_invoice_id,project_row.orbit_event_id,'EXTERNAL_TAX_DOCUMENT','orbit-documents',p_storage_path,p_checksum,nullif(p_drive_file_id,''),actor,p_idempotency_key,p_tax_type,trim(p_folio),p_issue_date,trim(p_customer_name),trim(p_customer_tax_id),p_net_amount,p_tax_amount,p_total_amount,'ADJUNTADO',p_original_filename,p_mime_type,jsonb_build_object('source','SII_MANUAL','observation',coalesce(p_observation,''),'confirmedBy',actor,'confirmedAt',now()))
  returning id into existing_id;

  insert into public.timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by)
  values(project_row.customer_id,p_project_id,project_row.orbit_event_id,'EXTERNAL_TAX_DOCUMENT_ATTACHED','Documento tributario adjuntado',p_tax_type||' Nº '||trim(p_folio),actor,'Founder','Administrator','EXTERNAL_TAX_DOCUMENT_ATTACHED','Document',existing_id,p_tax_type||' Nº '||trim(p_folio)||' fue adjuntado como evidencia SII externa.','external-tax-document:'||existing_id,actor);
  return existing_id;
end;
$$;

revoke all on function public.register_external_tax_document(uuid,uuid,uuid,text,text,date,text,text,numeric,numeric,numeric,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_external_tax_document(uuid,uuid,uuid,text,text,date,text,text,numeric,numeric,numeric,text,text,text,text,text,text,text) to authenticated;

comment on column public.documents.external_tax_document_type is 'External SII evidence only; it does not replace the ORBIT invoice ledger.';

commit;
