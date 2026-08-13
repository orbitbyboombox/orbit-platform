begin;

create table if not exists public.academy_articles(
  id uuid primary key default gen_random_uuid(),
  article_type text not null check(article_type in('MANUAL','VIDEO','CHECKLIST','PROTOCOL','FAQ','DOWNLOAD','ANNOUNCEMENT')),
  category text not null,
  status text not null default 'DRAFT' check(status in('DRAFT','PUBLISHED','HIDDEN','ARCHIVED','DELETED')),
  current_version integer not null default 1 check(current_version>0),
  version integer not null default 1,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.academy_article_versions(
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.academy_articles(id),
  version_number integer not null check(version_number>0),
  version_label text not null,
  title text not null,
  description text not null default '',
  body text not null default '',
  keywords text[] not null default '{}',
  file_bucket text,
  file_path text,
  file_name text,
  mime_type text,
  file_size bigint check(file_size is null or file_size>=0),
  duration_seconds integer check(duration_seconds is null or duration_seconds>=0),
  thumbnail_path text,
  published_on date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  search_document tsvector not null default ''::tsvector,
  unique(article_id,version_number)
);
create table if not exists public.academy_checklist_items(
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.academy_article_versions(id),
  position integer not null check(position>0),
  label text not null,
  unique(version_id,position)
);
create table if not exists public.academy_staff_progress(
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  article_id uuid not null references public.academy_articles(id),
  version_id uuid not null references public.academy_article_versions(id),
  first_accessed_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  viewed_at timestamptz,
  completed_at timestamptz,
  watched_seconds integer not null default 0 check(watched_seconds>=0),
  unique(staff_id,article_id,version_id)
);
create table if not exists public.academy_checklist_progress(
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  article_id uuid not null references public.academy_articles(id),
  version_id uuid not null references public.academy_article_versions(id),
  item_id uuid not null references public.academy_checklist_items(id),
  completed_at timestamptz not null default now(),
  unique(staff_id,item_id)
);
create index if not exists academy_articles_status_type_idx on public.academy_articles(status,article_type,updated_at desc);
create index if not exists academy_versions_search_idx on public.academy_article_versions using gin(search_document);
create index if not exists academy_progress_staff_idx on public.academy_staff_progress(staff_id,last_accessed_at desc);
create index if not exists academy_checklist_progress_staff_idx on public.academy_checklist_progress(staff_id,version_id);

create or replace function public.academy_set_search_document()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_document := to_tsvector(
    'spanish',
    coalesce(new.title, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce(new.body, '') || ' ' ||
    array_to_string(coalesce(new.keywords, '{}'::text[]), ' ')
  );
  return new;
end;
$$;

drop trigger if exists academy_versions_search_document on public.academy_article_versions;
create trigger academy_versions_search_document
before insert or update of title, description, body, keywords
on public.academy_article_versions
for each row execute function public.academy_set_search_document();

alter table public.academy_articles enable row level security;
alter table public.academy_article_versions enable row level security;
alter table public.academy_checklist_items enable row level security;
alter table public.academy_staff_progress enable row level security;
alter table public.academy_checklist_progress enable row level security;
create policy academy_articles_admin_all on public.academy_articles for all using(public.can_administer()) with check(public.can_administer());
create policy academy_versions_admin_all on public.academy_article_versions for all using(public.can_administer()) with check(public.can_administer());
create policy academy_items_admin_all on public.academy_checklist_items for all using(public.can_administer()) with check(public.can_administer());
create policy academy_progress_admin_read on public.academy_staff_progress for select using(public.can_administer());
create policy academy_checklist_progress_admin_read on public.academy_checklist_progress for select using(public.can_administer());

drop trigger if exists academy_articles_touch on public.academy_articles;
create trigger academy_articles_touch before update on public.academy_articles for each row execute function public.touch_versioned_row();
drop trigger if exists academy_articles_audit on public.academy_articles;
create trigger academy_articles_audit after insert or update or delete on public.academy_articles for each row execute function public.audit_row_change();
drop trigger if exists academy_versions_audit on public.academy_article_versions;
create trigger academy_versions_audit after insert or update or delete on public.academy_article_versions for each row execute function public.audit_row_change();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(
  'orbit-academy','orbit-academy',false,1073741824,array['application/pdf','video/mp4','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/png','image/jpeg','image/webp']
) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy orbit_academy_admin_storage on storage.objects for all using(bucket_id='orbit-academy' and public.can_administer()) with check(bucket_id='orbit-academy' and public.can_administer());

commit;
