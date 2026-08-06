-- ORBIT PF-01 production backbone. Apply with the Supabase migration runner.
create extension if not exists pgcrypto;

create type public.orbit_role as enum ('CEO','ADMINISTRATOR','SALES','OPERATIONS','STAFF','CUSTOMER','READONLY');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.orbit_role not null default 'READONLY',
  display_name text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create or replace function public.current_orbit_role() returns public.orbit_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.is_internal_user() returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.current_orbit_role() in ('CEO','ADMINISTRATOR','SALES','OPERATIONS','STAFF','READONLY')
$$;
create or replace function public.can_administer() returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.current_orbit_role() in ('CEO','ADMINISTRATOR')
$$;

create table public.customers (
  id uuid primary key default gen_random_uuid(), auth_user_id uuid unique references auth.users(id),
  full_name text not null, email text, phone text, company text, address text, city text, metadata jsonb not null default '{}',
  version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), approved_by uuid references auth.users(id),
  approved_at timestamptz, approval_reason text, deleted_by uuid references auth.users(id), deleted_at timestamptz
);
create table public.projects (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id), orbit_event_id text not null unique,
  name text not null, project_type text not null, status text not null, health text not null,
  event_date date, event_time time, location text, city text, budget jsonb not null default '{}', contract jsonb not null default '{}',
  finance jsonb not null default '{}', operations jsonb not null default '{}', resources jsonb not null default '{}',
  version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), approved_by uuid references auth.users(id),
  approved_at timestamptz, approval_reason text, deleted_by uuid references auth.users(id), deleted_at timestamptz
);
create table public.project_services (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade, service_code text not null, duration_hours numeric, extras jsonb not null default '[]', unique(project_id,service_code));
create table public.timeline_events (id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id), project_id uuid references public.projects(id), event_type text not null, title text not null, description text, previous_state text, new_state text, reason text, occurred_at timestamptz not null default now(), created_by uuid references auth.users(id), created_at timestamptz not null default now());
create table public.staff (id uuid primary key default gen_random_uuid(), profile_id uuid unique references public.profiles(id), first_name text not null, last_name text not null, rut text unique, phone text, email text, address text, commune text, emergency_contact jsonb, role text not null, rates jsonb not null default '{}', driving_license text, can_drive boolean not null default false, availability jsonb not null default '{}', observations text, status text not null default 'ACTIVE', version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table public.assignments (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), staff_id uuid not null references public.staff(id), assignment_type text not null, status text not null, resources jsonb not null default '{}', accepted_at timestamptz, approved_by uuid references auth.users(id), approved_at timestamptz, reason text, version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table public.customer_memory (id uuid primary key default gen_random_uuid(), customer_id uuid not null unique references public.customers(id), context jsonb not null default '{}', last_conversation_at timestamptz, version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table public.supplies (id uuid primary key default gen_random_uuid(), name text not null, supplier text, purchase_price numeric(14,2) not null, vat_included boolean not null, unit text not null, useful_life numeric, calculation_method text not null, status text not null, version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table public.expenses (id uuid primary key default gen_random_uuid(), project_id uuid references public.projects(id), supply_id uuid references public.supplies(id), category text not null, supplier text, document_number text, occurred_on date not null, subtotal numeric(14,2), vat numeric(14,2), total numeric(14,2) not null, currency text not null default 'CLP', vehicle_id text, receipt_path text, status text not null default 'PENDING', version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), approved_by uuid references auth.users(id), approved_at timestamptz, approval_reason text, deleted_at timestamptz);
create table public.profit_snapshots (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), revenue numeric(14,2) not null, crew_cost numeric(14,2) not null, transport_cost numeric(14,2) not null, fuel_cost numeric(14,2) not null, supplies_cost numeric(14,2) not null, operational_cost numeric(14,2) not null, gross_margin numeric(14,2) not null, gross_margin_percent numeric(7,3) not null, basis jsonb not null, created_by uuid references auth.users(id), created_at timestamptz not null default now());
create table public.calendar_sync (id uuid primary key default gen_random_uuid(), project_id uuid not null unique references public.projects(id), orbit_event_id text not null unique, external_event_id text unique, external_url text, status text not null, last_synced_at timestamptz, payload_hash text, version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_error jsonb);
create table public.drive_sync (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), destination_key text not null, external_folder_id text, status text not null, last_synced_at timestamptz, version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_error jsonb, unique(project_id,destination_key));
create table public.communications (id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id), project_id uuid references public.projects(id), channel text not null, direction text not null, communication_type text not null, thread_key text not null, subject text, body text, status text not null, external_message_id text, occurred_at timestamptz not null default now(), created_by uuid references auth.users(id), created_at timestamptz not null default now());
create table public.conversation_states (id uuid primary key default gen_random_uuid(), customer_id uuid not null unique references public.customers(id), status text not null, nova_enabled boolean not null default true, human_owner_id uuid references auth.users(id), context jsonb not null default '{}', version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.agreements (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), status text not null, template_version text not null, rendered_contract jsonb not null, signed_pdf_path text, drive_file_id text, version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), approved_by uuid references auth.users(id), approved_at timestamptz, approval_reason text);
create table public.agreement_evidence (id uuid primary key default gen_random_uuid(), agreement_id uuid not null references public.agreements(id), signer_name text not null, signer_email text, signature_path text not null, accepted_terms_version text not null, ip_hash text, user_agent text, signed_at timestamptz not null, evidence_hash text not null unique, created_at timestamptz not null default now());
create table public.documents (id uuid primary key default gen_random_uuid(), project_id uuid references public.projects(id), customer_id uuid references public.customers(id), document_type text not null, storage_bucket text not null, storage_path text not null unique, checksum text not null, drive_file_id text, created_by uuid references auth.users(id), created_at timestamptz not null default now(), deleted_at timestamptz);
create table public.connector_jobs (id uuid primary key default gen_random_uuid(), connector text not null, operation text not null, idempotency_key text not null unique, aggregate_id uuid, payload jsonb not null, status text not null default 'PENDING', attempt_count integer not null default 0, max_attempts integer not null default 5, next_attempt_at timestamptz not null default now(), last_error jsonb, locked_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.dead_letter_jobs (id uuid primary key default gen_random_uuid(), source_job_id uuid not null unique references public.connector_jobs(id), connector text not null, operation text not null, payload jsonb not null, failure jsonb not null, failed_at timestamptz not null default now(), resolved_at timestamptz, resolved_by uuid references auth.users(id));
create table public.connector_logs (id bigint generated always as identity primary key, connector text not null, operation text not null, correlation_id text not null, aggregate_id uuid, level text not null, message text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now());
create table public.audit_events (id bigint generated always as identity primary key, entity_type text not null, entity_id text not null, action text not null, actor_id uuid, reason text, previous_state jsonb, new_state jsonb, orbit_event_id text, occurred_at timestamptz not null default now());

create or replace function public.touch_versioned_row() returns trigger language plpgsql set search_path = public as $$ begin new.version = old.version + 1; new.updated_at = now(); if to_jsonb(new) ? 'updated_by' then new.updated_by = auth.uid(); end if; return new; end $$;
create or replace function public.audit_row_change() returns trigger language plpgsql security definer set search_path = public as $$ declare old_row jsonb; new_row jsonb; entity text; begin old_row := case when tg_op='INSERT' then null else to_jsonb(old) end; new_row := case when tg_op='DELETE' then null else to_jsonb(new) end; entity := coalesce(new_row->>'id', old_row->>'id'); insert into public.audit_events(entity_type,entity_id,action,actor_id,reason,previous_state,new_state,orbit_event_id) values(tg_table_name,entity,tg_op,auth.uid(),coalesce(new_row->>'approval_reason',old_row->>'approval_reason'),old_row,new_row,coalesce(new_row->>'orbit_event_id',old_row->>'orbit_event_id')); if tg_op='DELETE' then return old; end if; return new; end $$;

do $$ declare t text; begin
  foreach t in array array['customers','projects','staff','assignments','customer_memory','supplies','expenses','calendar_sync','drive_sync','conversation_states','agreements','connector_jobs'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_versioned_row()',t,t);
  end loop;
  foreach t in array array['customers','projects','timeline_events','staff','assignments','customer_memory','supplies','expenses','profit_snapshots','calendar_sync','drive_sync','communications','conversation_states','agreements','agreement_evidence','documents'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row_change()',t,t);
  end loop;
end $$;

create index projects_customer_idx on public.projects(customer_id) where deleted_at is null;
create index projects_event_date_idx on public.projects(event_date,id) where deleted_at is null;
create index timeline_project_time_idx on public.timeline_events(project_id,occurred_at desc,id desc);
create index assignments_project_idx on public.assignments(project_id,status) where deleted_at is null;
create index communications_customer_time_idx on public.communications(customer_id,occurred_at desc,id desc);
create index connector_jobs_ready_idx on public.connector_jobs(status,next_attempt_at) where status in ('PENDING','RETRY');
create index expenses_date_idx on public.expenses(occurred_on desc,id desc) where deleted_at is null;

do $$ declare t text; begin foreach t in array array['profiles','customers','projects','project_services','timeline_events','staff','assignments','customer_memory','supplies','expenses','profit_snapshots','calendar_sync','drive_sync','communications','conversation_states','agreements','agreement_evidence','documents','connector_jobs','dead_letter_jobs','connector_logs','audit_events'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create policy profiles_self_read on public.profiles for select using (id=auth.uid() or public.is_internal_user());
create policy profiles_admin_write on public.profiles for all using (public.can_administer()) with check (public.can_administer());
do $$ declare t text; begin foreach t in array array['customers','projects','project_services','timeline_events','staff','assignments','customer_memory','supplies','expenses','profit_snapshots','calendar_sync','drive_sync','communications','conversation_states','agreements','agreement_evidence','documents','connector_jobs','dead_letter_jobs','connector_logs','audit_events'] loop execute format('create policy %I_internal_read on public.%I for select using (public.is_internal_user())',t,t); execute format('create policy %I_admin_write on public.%I for all using (public.can_administer()) with check (public.can_administer())',t,t); end loop; end $$;
create policy customers_customer_read on public.customers for select using (auth_user_id=auth.uid() and deleted_at is null);
create policy projects_customer_read on public.projects for select using (exists(select 1 from public.customers c where c.id=customer_id and c.auth_user_id=auth.uid()) and deleted_at is null);
create policy staff_own_read on public.staff for select using (profile_id=auth.uid() and deleted_at is null);
create policy assignments_staff_read on public.assignments for select using (exists(select 1 from public.staff s where s.id=staff_id and s.profile_id=auth.uid()) and deleted_at is null);

insert into storage.buckets(id,name,public,file_size_limit) values ('orbit-documents','orbit-documents',false,52428800),('orbit-signatures','orbit-signatures',false,10485760),('orbit-expenses','orbit-expenses',false,20971520) on conflict(id) do nothing;
create policy orbit_storage_internal_read on storage.objects for select using (bucket_id in ('orbit-documents','orbit-signatures','orbit-expenses') and public.is_internal_user());
create policy orbit_storage_admin_write on storage.objects for all using (bucket_id in ('orbit-documents','orbit-signatures','orbit-expenses') and public.can_administer()) with check (bucket_id in ('orbit-documents','orbit-signatures','orbit-expenses') and public.can_administer());

do $$ begin
  alter publication supabase_realtime add table public.projects, public.timeline_events, public.assignments, public.communications, public.connector_jobs;
exception when duplicate_object then null; end $$;

revoke update, delete on public.audit_events from authenticated;
revoke update, delete on public.timeline_events from authenticated;
revoke update, delete on public.agreement_evidence from authenticated;
