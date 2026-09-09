-- Supply the mandatory production timeline metadata for Staff advances.
-- This replaces only the RPC body; no historical rows or financial data are changed.
create or replace function public.register_staff_advance_with_documents(
  p_settlement_id uuid,p_amount numeric,p_date date,p_method text,p_notes text,p_idempotency_key text,
  p_receipt_bucket text,p_receipt_path text,p_receipt_file_name text,p_receipt_mime_type text,
  p_boleta_bucket text default null,p_boleta_path text default null,p_boleta_file_name text default null,p_boleta_mime_type text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); settlement public.event_staff_payments%rowtype; project_row public.projects%rowtype; account public.staff_monthly_accounts%rowtype; receipt_id uuid; boleta_id uuid; movement_id uuid; month_label text;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede registrar adelantos.'; end if;
  if coalesce(p_amount,0)<=0 or nullif(trim(p_receipt_path),'') is null then raise exception 'Monto y comprobante de pago son obligatorios.'; end if;
  select * into settlement from public.event_staff_payments where id=p_settlement_id and status='CONFIRMED' and deleted_at is null for update;
  if not found then raise exception 'Liquidación Staff confirmada no encontrada.'; end if;
  select * into project_row from public.projects where id=settlement.project_id and deleted_at is null;
  if not found then raise exception 'Evento Staff no encontrado.'; end if;
  if exists(select 1 from public.event_staff_settlement_movements where legacy_source='staff-advance:'||p_idempotency_key and deleted_at is null) then
    select * into account from public.staff_monthly_accounts where staff_id=settlement.staff_id and accounting_month=date_trunc('month',project_row.event_date)::date;
    return jsonb_build_object('idempotent',true,'settlementId',settlement.id,'accountId',account.id);
  end if;
  if exists(select 1 from public.staff_monthly_accounts where staff_id=settlement.staff_id and accounting_month=date_trunc('month',project_row.event_date)::date and settlement_status='FINALIZED') then raise exception 'La liquidación mensual está finalizada y no admite nuevos movimientos.'; end if;
  month_label:=to_char(project_row.event_date,'YYYY-MM');
  insert into public.staff_onboarding_documents(invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,storage_bucket,storage_path,file_name,mime_type,created_by)
  values(null,settlement.staff_id,'STAFF_PAYMENT_RECEIPT','PAGOS',month_label,'Comprobante de adelanto Staff','ACTIVE',p_receipt_bucket,p_receipt_path,p_receipt_file_name,p_receipt_mime_type,actor)
  returning id into receipt_id;
  if nullif(trim(p_boleta_path),'') is not null then
    insert into public.staff_onboarding_documents(invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,storage_bucket,storage_path,file_name,mime_type,created_by)
    values(null,settlement.staff_id,'BOLETA_HONORARIOS','BOLETAS',month_label,'Boleta de honorarios · adelanto','ACTIVE',p_boleta_bucket,p_boleta_path,p_boleta_file_name,p_boleta_mime_type,actor)
    returning id into boleta_id;
  end if;
  insert into public.event_staff_settlement_movements(settlement_id,movement_type,amount,movement_date,method,receipt_path,notes,legacy_source,created_by,updated_by,receipt_document_id,boleta_document_id)
  values(settlement.id,'ADVANCE',p_amount,coalesce(p_date,current_date),nullif(trim(p_method),''),p_receipt_path,nullif(trim(p_notes),''),'staff-advance:'||p_idempotency_key,actor,actor,receipt_id,boleta_id)
  returning id into movement_id;
  select * into account from public.ensure_staff_monthly_account(settlement.staff_id,project_row.event_date);
  insert into public.timeline_events(
    project_id,customer_id,event_type,title,description,new_state,reason,
    orbit_event_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by)
  values(
    project_row.id,project_row.customer_id,'STAFF_ADVANCE_REGISTERED','Adelanto Staff registrado','Adelanto operativo registrado en el ledger Staff.',
    'ADVANCE',coalesce(nullif(trim(p_notes),''),'Adelanto registrado por Founder.'),project_row.orbit_event_id,'Founder','Administrator',
    'STAFF_ADVANCE_REGISTERED','StaffAdvance',movement_id,'Adelanto operativo registrado en el ledger Staff.','STAFF-ADVANCE-'||p_idempotency_key,actor);
  return jsonb_build_object('idempotent',false,'movementId',movement_id,'receiptDocumentId',receipt_id,'boletaDocumentId',boleta_id,'accountId',account.id);
end $$;
