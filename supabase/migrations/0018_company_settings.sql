begin;

create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  settings_key text not null unique default 'PRIMARY',
  company_name text not null,
  legal_name text not null,
  brand_name text not null,
  product_name text not null,
  product_version text not null,
  developed_by text not null,
  powered_by text not null,
  tax_id text,
  tax_name text not null default 'IVA',
  tax_rate numeric(6,3) not null default 19,
  support_email text,
  sales_email text,
  operations_email text,
  phone text,
  website text,
  address text,
  city text,
  country text not null default 'Chile',
  locale text not null default 'es-CL',
  currency text not null default 'CLP',
  timezone text not null default 'America/Santiago',
  google_workspace_domain text,
  logo_url text not null,
  isotype_url text not null,
  document_logo_url text not null,
  portal_logo_url text not null,
  dashboard_logo_url text not null,
  email_logo_url text not null,
  primary_color text not null default '#F28E2B',
  accent_color text not null default '#F28E2B',
  login_tagline text not null,
  portal_kicker text not null,
  portal_welcome text not null,
  email_signature text not null,
  contract_footer text not null,
  quotation_footer text not null,
  drive_root_folder text not null,
  contract_configuration jsonb not null default '{}',
  pdf_configuration jsonb not null default '{}',
  email_configuration jsonb not null default '{}',
  portal_configuration jsonb not null default '{}',
  dashboard_configuration jsonb not null default '{}',
  version integer not null default 1,
  approval_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint company_settings_color_check check (primary_color ~ '^#[0-9A-Fa-f]{6}$' and accent_color ~ '^#[0-9A-Fa-f]{6}$')
);

insert into public.company_settings(
  settings_key,company_name,legal_name,brand_name,product_name,product_version,developed_by,powered_by,
  support_email,sales_email,operations_email,website,country,locale,currency,timezone,google_workspace_domain,
  logo_url,isotype_url,document_logo_url,portal_logo_url,dashboard_logo_url,email_logo_url,
  login_tagline,portal_kicker,portal_welcome,email_signature,contract_footer,quotation_footer,drive_root_folder,
  contract_configuration,pdf_configuration,email_configuration,portal_configuration,dashboard_configuration
) values (
  'PRIMARY','BOOMBOX','BOOMBOX','BOOMBOX','ORBIT','v1.0','BOOMBOX','NOVA CORE',
  'admin@orbit.boom-box.cl','ventas@boom-box.cl','operaciones@boom-box.cl','https://boom-box.cl','Chile','es-CL','CLP','America/Santiago','boom-box.cl',
  '/branding/ORBIT%20V1-0%20SINFONDO.png','/branding/orbit-isotype.png','/branding/ORBIT%20V1-0%20SINFONDO.png','/branding/ORBIT%20V1-0%20SINFONDO.png','/branding/ORBIT%20V1-0%20SINFONDO.png','/branding/ORBIT%20V1-0%20SINFONDO.png',
  'La plataforma operativa de BOOMBOX','Tu experiencia BOOMBOX','Todo lo importante de tu evento, en un solo lugar.','Equipo BOOMBOX','Documento emitido por BOOMBOX mediante ORBIT.','Cotización emitida por BOOMBOX mediante ORBIT.','BOOMBOX ORBIT',
  '{"agreementVersion":"1.0","signatureValidityDays":7}',
  '{"pageSize":"A4","showProductSignature":true}',
  '{"senderName":"Equipo BOOMBOX","replyTo":"ventas@boom-box.cl"}',
  '{"showCountdown":true,"allowExtraRequests":true,"allowDesignUploads":true}',
  '{"showWorkspaceHealth":true,"showFinancialSummary":true}'
) on conflict(settings_key) do nothing;

create index if not exists company_settings_key_idx on public.company_settings(settings_key);
alter table public.company_settings enable row level security;
create policy company_settings_public_read on public.company_settings for select using (settings_key='PRIMARY');
create policy company_settings_admin_write on public.company_settings for all using(public.can_administer()) with check(public.can_administer());

drop trigger if exists company_settings_touch on public.company_settings;
create trigger company_settings_touch before update on public.company_settings for each row execute function public.touch_versioned_row();
drop trigger if exists company_settings_audit on public.company_settings;
create trigger company_settings_audit after insert or update or delete on public.company_settings for each row execute function public.audit_row_change();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('orbit-branding','orbit-branding',true,10485760,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy orbit_branding_public_read on storage.objects for select using(bucket_id='orbit-branding');
create policy orbit_branding_admin_write on storage.objects for all using(bucket_id='orbit-branding' and public.can_administer()) with check(bucket_id='orbit-branding' and public.can_administer());

commit;
