-- RC-30D · Staff onboarding. Invitations are temporary; Staff is created only after approval.
alter table public.staff add column if not exists birth_date date;
alter table public.staff add column if not exists city text;
alter table public.staff add column if not exists account_holder text;

create table if not exists public.staff_onboarding_invitations(
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  first_name text not null,
  last_name text not null,
  email text not null,
  mobile text not null,
  status text not null default 'INVITED' check(status in('INVITED','OPENED','SUBMITTED','CHANGES_REQUESTED','APPROVED','REJECTED','EXPIRED')),
  submitted_data jsonb not null default '{}',
  expires_at timestamptz not null,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_notes text,
  staff_id uuid references public.staff(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_onboarding_active_email_idx
  on public.staff_onboarding_invitations(lower(email))
  where status in('INVITED','OPENED','SUBMITTED','CHANGES_REQUESTED');

create table if not exists public.staff_onboarding_documents(
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.staff_onboarding_invitations(id) on delete cascade,
  staff_id uuid references public.staff(id),
  document_type text not null check(document_type in('IDENTITY_FRONT','IDENTITY_BACK','DRIVER_LICENSE_FRONT','DRIVER_LICENSE_BACK')),
  storage_bucket text not null default 'orbit-documents',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  created_at timestamptz not null default now(),
  unique(invitation_id,document_type)
);

alter table public.staff_onboarding_invitations enable row level security;
alter table public.staff_onboarding_documents enable row level security;
create policy staff_onboarding_admin_all on public.staff_onboarding_invitations for all using(public.can_administer()) with check(public.can_administer());
create policy staff_onboarding_documents_admin_all on public.staff_onboarding_documents for all using(public.can_administer()) with check(public.can_administer());
revoke all on public.staff_onboarding_invitations,public.staff_onboarding_documents from anon;
grant select,insert,update on public.staff_onboarding_invitations to authenticated;
grant select on public.staff_onboarding_documents to authenticated;

create or replace function public.review_staff_onboarding(p_invitation_id uuid,p_action text,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare invitation public.staff_onboarding_invitations%rowtype; payload jsonb; created_staff uuid;
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
  elsif p_action<>'APPROVE' or invitation.status<>'SUBMITTED' then
    raise exception 'La postulación no está disponible para aprobación.';
  end if;
  payload:=invitation.submitted_data;
  if exists(select 1 from public.staff where deleted_at is null and (upper(regexp_replace(coalesce(rut,''),'[^0-9K]','','g'))=upper(regexp_replace(payload->>'rut','[^0-9K]','','g')) or lower(email)=lower(invitation.email))) then
    raise exception 'Ya existe un perfil Staff con este RUT o correo.';
  end if;
  insert into public.staff(first_name,last_name,rut,phone,email,address,commune,city,birth_date,emergency_contact,role,rates,availability,observations,status,bank,account_type,account_number,account_holder,capabilities,specializations,can_drive,portal_enabled,portal_activated_at,created_by,updated_by)
  values(invitation.first_name,invitation.last_name,payload->>'rut',coalesce(payload->>'phone',invitation.mobile),invitation.email,payload->>'address',payload->>'district',payload->>'city',nullif(payload->>'birthDate','')::date,jsonb_build_object('name',payload->>'emergencyName','phone',payload->>'emergencyPhone'),'SETUP_TEARDOWN','{}','{"label":"Disponible"}','Onboarding aprobado','ACTIVE',payload->>'bank',payload->>'accountType',payload->>'accountNumber',payload->>'accountHolder',coalesce(array(select jsonb_array_elements_text(payload->'capabilities')),array[]::text[]),'{}',coalesce((payload->>'canDrive')::boolean,false),true,now(),auth.uid(),auth.uid()) returning id into created_staff;
  update public.staff_onboarding_invitations set status='APPROVED',staff_id=created_staff,review_notes=p_notes,reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=invitation.id;
  update public.staff_onboarding_documents set staff_id=created_staff where invitation_id=invitation.id;
  return created_staff;
end $$;
grant execute on function public.review_staff_onboarding(uuid,text,text) to authenticated;
