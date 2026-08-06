begin;

create table if not exists public.google_workspace_connections (
  id uuid primary key default gen_random_uuid(),
  singleton_key text not null unique check (singleton_key = 'PRIMARY'),
  workspace_account text not null,
  workspace_domain text not null,
  connection_status text not null check (connection_status in ('CONNECTED','DISCONNECTED','ERROR')),
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.google_workspace_connections enable row level security;
revoke all on public.google_workspace_connections from anon, authenticated;
grant all on public.google_workspace_connections to service_role;

comment on table public.google_workspace_connections is
  'Server-only Google OAuth credentials. No client RLS policy is intentionally defined.';

commit;
