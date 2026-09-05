-- Staff boletas are eligible once the canonical calculation has no operational blockers.
-- Settlement finalization is a Founder accounting step and must not block document intake.
create or replace function public.submit_staff_monthly_boleta(
  p_staff_id uuid,p_month date,p_bucket text,p_path text,p_file_name text,p_mime_type text,p_actor uuid default null
)
returns uuid language plpgsql security definer set search_path=public as $$
declare account public.staff_monthly_accounts%rowtype; document_id uuid;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' then raise exception 'Backend autorizado requerido.';end if;
  account:=public.ensure_staff_monthly_account(p_staff_id,p_month);
  if account.payment_status='PAID' then raise exception 'La cuenta mensual ya está pagada.';end if;
  if account.boleta_status<>'REJECTED' and account.boleta_document_id is not null then raise exception 'La boleta vigente ya fue enviada.';end if;
  insert into public.staff_onboarding_documents(invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,storage_bucket,storage_path,file_name,mime_type,created_by)
  values(null,p_staff_id,'BOLETA_HONORARIOS','BOLETAS',date_trunc('month',p_month)::date,'Boleta de honorarios','ACTIVE',p_bucket,p_path,p_file_name,p_mime_type,p_actor)
  returning id into document_id;
  if account.boleta_document_id is not null then update public.staff_onboarding_documents set status='REPLACED',updated_at=now() where id=account.boleta_document_id;end if;
  update public.staff_monthly_accounts set boleta_status='RECEIVED',boleta_document_id=document_id,boleta_rejection_reason=null,boleta_reviewed_at=null,boleta_reviewed_by=null,payment_status='PENDING',drive_sync_status='PENDING',updated_at=now() where id=account.id;
  insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,state) values(account.id,'BOLETA_UPLOADED',p_actor,jsonb_build_object('documentId',document_id));
  return document_id;
end $$;
