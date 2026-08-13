begin;

-- Invitation lifecycle is explicit. Approved collaborators remain Staff records.
alter table public.staff_onboarding_invitations drop constraint if exists staff_onboarding_invitations_status_check;
alter table public.staff_onboarding_invitations add constraint staff_onboarding_invitations_status_check
  check(status in('INVITED','OPENED','SUBMITTED','CHANGES_REQUESTED','APPROVED','REJECTED','CANCELLED','EXPIRED'));

create or replace function public.review_staff_onboarding(p_invitation_id uuid,p_action text,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare invitation public.staff_onboarding_invitations%rowtype; payload jsonb; operational_staff uuid;
begin
  if not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  select * into invitation from public.staff_onboarding_invitations where id=p_invitation_id for update;
  if invitation.id is null then raise exception 'Invitación no encontrada.'; end if;
  if p_action='REQUEST_CHANGES' then
    update public.staff_onboarding_invitations set status='CHANGES_REQUESTED',review_notes=p_notes,reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=invitation.id;
    return null;
  elsif p_action='REJECT' then
    update public.staff_onboarding_invitations set status='REJECTED',review_notes=p_notes,reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=invitation.id;
    return null;
  elsif p_action<>'APPROVE' then
    raise exception 'Acción de revisión no válida.';
  end if;
  if invitation.status='APPROVED' and invitation.staff_id is not null then
    update public.staff set status='ACTIVE',portal_enabled=true,portal_activated_at=coalesce(portal_activated_at,now()),deleted_at=null,deleted_by=null,updated_by=auth.uid(),approval_reason='Consistencia automática de onboarding' where id=invitation.staff_id;
    return invitation.staff_id;
  end if;
  if invitation.status<>'SUBMITTED' then raise exception 'La postulación no está disponible para aprobación.'; end if;
  payload:=invitation.submitted_data;
  select id into operational_staff from public.staff
    where upper(regexp_replace(coalesce(rut,''),'[^0-9K]','','g'))=upper(regexp_replace(payload->>'rut','[^0-9K]','','g'))
       or lower(email)=lower(invitation.email)
    order by deleted_at nulls first limit 1 for update;
  if operational_staff is null then
    insert into public.staff(first_name,last_name,rut,phone,email,address,commune,city,birth_date,emergency_contact,role,rates,availability,observations,status,bank,account_type,account_number,account_holder,capabilities,specializations,can_drive,portal_enabled,portal_activated_at,created_by,updated_by)
    values(invitation.first_name,invitation.last_name,payload->>'rut',coalesce(payload->>'phone',invitation.mobile),invitation.email,payload->>'address',payload->>'district',payload->>'city',nullif(payload->>'birthDate','')::date,jsonb_build_object('name',payload->>'emergencyName','phone',payload->>'emergencyPhone'),'SETUP_TEARDOWN','{}','{"label":"Disponible"}','Onboarding aprobado','ACTIVE',payload->>'bank',payload->>'accountType',payload->>'accountNumber',payload->>'accountHolder',coalesce(array(select jsonb_array_elements_text(payload->'capabilities')),array[]::text[]),'{}',coalesce((payload->>'canDrive')::boolean,false),true,now(),auth.uid(),auth.uid()) returning id into operational_staff;
  else
    update public.staff set first_name=invitation.first_name,last_name=invitation.last_name,rut=coalesce(nullif(payload->>'rut',''),rut),phone=coalesce(nullif(payload->>'phone',''),invitation.mobile,phone),email=invitation.email,address=coalesce(nullif(payload->>'address',''),address),commune=coalesce(nullif(payload->>'district',''),commune),city=coalesce(nullif(payload->>'city',''),city),birth_date=coalesce(nullif(payload->>'birthDate','')::date,birth_date),emergency_contact=jsonb_build_object('name',payload->>'emergencyName','phone',payload->>'emergencyPhone'),bank=coalesce(nullif(payload->>'bank',''),bank),account_type=coalesce(nullif(payload->>'accountType',''),account_type),account_number=coalesce(nullif(payload->>'accountNumber',''),account_number),account_holder=coalesce(nullif(payload->>'accountHolder',''),account_holder),capabilities=coalesce(array(select jsonb_array_elements_text(payload->'capabilities')),capabilities),can_drive=coalesce((payload->>'canDrive')::boolean,can_drive),status='ACTIVE',portal_enabled=true,portal_activated_at=coalesce(portal_activated_at,now()),deleted_at=null,deleted_by=null,updated_by=auth.uid(),approval_reason='Perfil operacional enlazado desde onboarding' where id=operational_staff;
  end if;
  update public.staff_onboarding_invitations set status='APPROVED',staff_id=operational_staff,review_notes=p_notes,reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=invitation.id;
  update public.staff_onboarding_documents set staff_id=operational_staff where invitation_id=invitation.id;
  return operational_staff;
end $$;

-- Repair already-approved onboarding links without recreating operational Staff.
update public.staff_onboarding_invitations i set staff_id=s.id,updated_at=now()
from public.staff s where i.status='APPROVED' and i.staff_id is null and s.deleted_at is null
and (lower(s.email)=lower(i.email) or upper(regexp_replace(coalesce(s.rut,''),'[^0-9K]','','g'))=upper(regexp_replace(coalesce(i.submitted_data->>'rut',''),'[^0-9K]','','g')));
update public.staff s set portal_enabled=true,portal_activated_at=coalesce(s.portal_activated_at,now()),status='ACTIVE',deleted_at=null,deleted_by=null,approval_reason='RC-STABILITY-01 · consistencia onboarding',updated_at=now()
from public.staff_onboarding_invitations i where i.status='APPROVED' and i.staff_id=s.id;

-- Finance configuration has only canonical production accounts.
insert into public.finance_bank_accounts(code,name,account_kind,account_type,bank_name,is_primary,active,metadata)
values('BCI_PRIMARY','Banco BCI','BANK','Cuenta Corriente','BCI',true,true,'{"description":"Cuenta principal empresa"}'),
      ('MERCADO_PAGO','Mercado Pago','PAYMENT_GATEWAY','Gateway de pagos','Mercado Pago',false,true,'{"description":"Online Payment Gateway"}')
on conflict(code) do update set name=excluded.name,account_kind=excluded.account_kind,account_type=excluded.account_type,bank_name=excluded.bank_name,is_primary=excluded.is_primary,active=true,metadata=excluded.metadata,updated_at=now();

update public.finance_recurring_expense_rules set bank_account_id=(select id from public.finance_bank_accounts where code='BCI_PRIMARY')
where bank_account_id in(select id from public.finance_bank_accounts where code not in('BCI_PRIMARY','MERCADO_PAGO'));
update public.bank_reconciliation_imports set bank_account_id=(select id from public.finance_bank_accounts where code=case when source='MERCADO_PAGO' then 'MERCADO_PAGO' else 'BCI_PRIMARY' end)
where bank_account_id in(select id from public.finance_bank_accounts where code not in('BCI_PRIMARY','MERCADO_PAGO'));
delete from public.finance_bank_accounts where code not in('BCI_PRIMARY','MERCADO_PAGO');

commit;
