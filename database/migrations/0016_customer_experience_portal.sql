begin;

create table if not exists public.customer_portal_tokens(
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), customer_id uuid not null references public.customers(id),
  token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz, last_accessed_at timestamptz,
  version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
  constraint customer_portal_token_expiry check(expires_at>created_at)
);
create unique index if not exists customer_portal_tokens_active_project_idx on public.customer_portal_tokens(project_id) where revoked_at is null;

create table if not exists public.customer_portal_requests(
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), customer_id uuid not null references public.customers(id),
  request_type text not null check(request_type in ('MESSAGE','QUESTION','ADDITIONAL_SERVICE','DESIGN_COMMENT')),
  subject text, message text not null, requested_code text, status text not null default 'PENDING' check(status in ('PENDING','REVIEWING','APPROVED','REJECTED','RESOLVED')),
  correlation_id text not null unique, created_at timestamptz not null default now()
);

create table if not exists public.customer_portal_uploads(
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), customer_id uuid not null references public.customers(id),
  file_name text not null, mime_type text not null, drive_file_id text not null, status text not null default 'UPLOADED', correlation_id text not null unique, created_at timestamptz not null default now()
);

create table if not exists public.internal_notifications(
  id uuid primary key default gen_random_uuid(), project_id uuid references public.projects(id), customer_id uuid references public.customers(id),
  notification_type text not null, title text not null, message text not null, status text not null default 'UNREAD' check(status in ('UNREAD','READ','RESOLVED')),
  correlation_id text not null unique, created_at timestamptz not null default now(), read_at timestamptz
);

do $$ begin
  create trigger customer_portal_tokens_touch before update on public.customer_portal_tokens for each row execute function public.touch_versioned_row();
exception when duplicate_object then null; end $$;
do $$ declare t text; begin foreach t in array array['customer_portal_tokens','customer_portal_requests','customer_portal_uploads','internal_notifications'] loop
  execute format('drop trigger if exists %I_audit on public.%I',t,t);
  execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row_change()',t,t);
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy %I_internal_read on public.%I for select using(public.is_internal_user())',t,t);
  execute format('create policy %I_admin_write on public.%I for all using(public.can_administer()) with check(public.can_administer())',t,t);
end loop; end $$;

revoke all on public.customer_portal_tokens,public.customer_portal_requests,public.customer_portal_uploads,public.internal_notifications from anon;

commit;
