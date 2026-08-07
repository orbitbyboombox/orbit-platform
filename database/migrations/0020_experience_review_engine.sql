begin;

create table if not exists public.experience_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id),
  customer_id uuid not null references public.customers(id),
  orbit_event_id text not null unique,
  venue_name text not null,
  venue_city text,
  general_rating smallint not null check (general_rating between 1 and 5),
  customer_experience text not null check (customer_experience in ('EXCELLENT','GOOD','AVERAGE','POOR')),
  operational_experience text not null check (operational_experience in ('EXCELLENT','GOOD','AVERAGE','POOR')),
  equipment_review jsonb not null default '{}',
  staff_review jsonb not null default '{}',
  venue_knowledge text not null default '',
  customer_knowledge text not null default '',
  lessons_repeat text not null default '',
  lessons_avoid text not null default '',
  recommendations text not null default '',
  status text not null default 'COMPLETED' check (status in ('COMPLETED','ARCHIVED')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  version integer not null default 1
);

create table if not exists public.experience_review_evidence (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.experience_reviews(id),
  evidence_type text not null check (evidence_type in ('SETUP','EVENT','TEARDOWN')),
  storage_bucket text not null default 'orbit-documents',
  storage_path text not null unique,
  content_type text not null,
  file_size bigint not null check (file_size > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.experience_review_staff (
  review_id uuid not null references public.experience_reviews(id),
  staff_id uuid not null references public.staff(id),
  assignment_type text not null,
  feedback text not null default '',
  primary key(review_id,staff_id,assignment_type)
);

create index if not exists experience_reviews_customer_idx on public.experience_reviews(customer_id,created_at desc);
create index if not exists experience_reviews_venue_idx on public.experience_reviews(lower(venue_name),lower(coalesce(venue_city,'')),created_at desc);
create index if not exists experience_evidence_review_idx on public.experience_review_evidence(review_id,evidence_type,created_at desc);
create index if not exists experience_review_staff_lookup_idx on public.experience_review_staff(staff_id,review_id);

alter table public.experience_reviews enable row level security;
alter table public.experience_review_evidence enable row level security;
alter table public.experience_review_staff enable row level security;
create policy experience_reviews_internal_read on public.experience_reviews for select using (public.is_internal_user());
create policy experience_reviews_manager_write on public.experience_reviews for all using (public.current_orbit_role() in ('CEO','ADMINISTRATOR','OPERATIONS')) with check (public.current_orbit_role() in ('CEO','ADMINISTRATOR','OPERATIONS'));
create policy experience_evidence_internal_read on public.experience_review_evidence for select using (public.is_internal_user());
create policy experience_evidence_manager_write on public.experience_review_evidence for all using (public.current_orbit_role() in ('CEO','ADMINISTRATOR','OPERATIONS')) with check (public.current_orbit_role() in ('CEO','ADMINISTRATOR','OPERATIONS'));
create policy experience_review_staff_internal_read on public.experience_review_staff for select using (public.is_internal_user());
create policy experience_review_staff_manager_write on public.experience_review_staff for all using (public.current_orbit_role() in ('CEO','ADMINISTRATOR','OPERATIONS')) with check (public.current_orbit_role() in ('CEO','ADMINISTRATOR','OPERATIONS'));

drop trigger if exists experience_reviews_audit on public.experience_reviews;
create trigger experience_reviews_audit after insert or update or delete on public.experience_reviews for each row execute function public.audit_row_change();
drop trigger if exists experience_review_evidence_audit on public.experience_review_evidence;
create trigger experience_review_evidence_audit after insert or update or delete on public.experience_review_evidence for each row execute function public.audit_row_change();

revoke update, delete on public.experience_reviews from anon, authenticated;
revoke update, delete on public.experience_review_evidence from anon, authenticated;
revoke update, delete on public.experience_review_staff from anon, authenticated;

commit;
