begin;

-- Staff Document Center: keep the existing protected objects and enrich their
-- canonical metadata. Onboarding rows remain untouched and are classified in
-- place; new Founder uploads may belong directly to a Staff profile.
alter table public.staff_onboarding_documents
  alter column invitation_id drop not null;

alter table public.staff_onboarding_documents
  add column if not exists category text not null default 'IDENTIDAD',
  add column if not exists applicable_month text,
  add column if not exists friendly_label text,
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

alter table public.staff_onboarding_documents
  drop constraint if exists staff_onboarding_documents_document_type_check;

alter table public.staff_onboarding_documents
  drop constraint if exists staff_onboarding_documents_category_check,
  drop constraint if exists staff_onboarding_documents_month_check,
  drop constraint if exists staff_onboarding_documents_status_check,
  drop constraint if exists staff_onboarding_documents_owner_check,
  add constraint staff_onboarding_documents_category_check
    check(category in('IDENTIDAD','CONTRATOS','BOLETAS','GASTOS','LIQUIDACIONES','OTROS')),
  add constraint staff_onboarding_documents_month_check
    check(applicable_month is null or applicable_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  add constraint staff_onboarding_documents_status_check
    check(status in('ACTIVE','ARCHIVED')),
  add constraint staff_onboarding_documents_owner_check
    check(invitation_id is not null or staff_id is not null),
  add constraint staff_onboarding_documents_document_type_check
    check(length(trim(document_type)) between 2 and 80);

update public.staff_onboarding_documents
set category='IDENTIDAD',
    friendly_label=coalesce(
      nullif(trim(friendly_label),''),
      case document_type
        when 'IDENTITY_FRONT' then 'Cédula de identidad · frente'
        when 'IDENTITY_BACK' then 'Cédula de identidad · reverso'
        when 'DRIVER_LICENSE_FRONT' then 'Licencia de conducir · frente'
        when 'DRIVER_LICENSE_BACK' then 'Licencia de conducir · reverso'
        else file_name
      end
    ),
    updated_at=coalesce(updated_at,created_at)
where document_type in(
  'IDENTITY_FRONT',
  'IDENTITY_BACK',
  'DRIVER_LICENSE_FRONT',
  'DRIVER_LICENSE_BACK'
);

create index if not exists staff_onboarding_documents_staff_category_idx
  on public.staff_onboarding_documents(staff_id,category,applicable_month,created_at desc)
  where staff_id is not null;

create index if not exists staff_onboarding_documents_invitation_idx
  on public.staff_onboarding_documents(invitation_id,created_at desc)
  where invitation_id is not null;

comment on table public.staff_onboarding_documents is
  'Canonical protected Staff document metadata. Existing onboarding identity objects and subsequent Staff-ID namespaced uploads share this table.';
comment on column public.staff_onboarding_documents.category is
  'Logical Staff Document Center category; it does not require moving historical Storage objects.';
comment on column public.staff_onboarding_documents.applicable_month is
  'Optional canonical YYYY-MM period for BOLETAS, GASTOS and LIQUIDACIONES.';

commit;
