begin;

create table if not exists public.commercial_prices (
  id uuid primary key default gen_random_uuid(), category text not null check (category in ('SERVICE','EXTRA','TRANSPORT')),
  code text not null, label text not null, duration_hours integer, destination text, unit_price numeric(14,2), currency text not null default 'CLP',
  pricing_status text not null check (pricing_status in ('DEFINED','REQUIRES_QUOTE')), vat_exclusive boolean not null default false,
  rules jsonb not null default '{}', version integer not null default 1, approved_by uuid references auth.users(id), approved_at timestamptz,
  approval_reason text, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), deleted_by uuid references auth.users(id), deleted_at timestamptz,
  unique(category,code,duration_hours,destination)
);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(), quotation_number text not null unique, customer_id uuid not null references public.customers(id),
  project_id uuid not null references public.projects(id), orbit_event_id text not null, status text not null check (status in ('DRAFT','SENT','ACCEPTED','REJECTED')),
  customer_type text not null check (customer_type in ('PRIVATE','COMPANY')), event_type text not null, issue_date date not null, expiration_date date not null,
  currency text not null default 'CLP', subtotal numeric(14,2) not null, transport_total numeric(14,2) not null, discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null, grand_total numeric(14,2) not null, pricing_snapshot jsonb not null, blockers jsonb not null default '[]',
  pdf_storage_path text, drive_folder_id text, drive_file_id text, gmail_draft_id text,
  version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), approved_by uuid references auth.users(id), approved_at timestamptz,
  approval_reason text, deleted_by uuid references auth.users(id), deleted_at timestamptz
);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(), quotation_id uuid not null references public.quotations(id) on delete cascade,
  item_type text not null check (item_type in ('SERVICE','EXTRA','TRANSPORT')), code text not null, label text not null,
  quantity numeric(14,3) not null, unit_price numeric(14,2) not null, total numeric(14,2) not null, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);

create index if not exists quotations_project_idx on public.quotations(project_id,created_at desc) where deleted_at is null;
create index if not exists quotations_customer_idx on public.quotations(customer_id,created_at desc) where deleted_at is null;
create index if not exists quotation_items_quotation_idx on public.quotation_items(quotation_id,id);

drop trigger if exists commercial_prices_touch on public.commercial_prices;
create trigger commercial_prices_touch before update on public.commercial_prices for each row execute function public.touch_versioned_row();
drop trigger if exists quotations_touch on public.quotations;
create trigger quotations_touch before update on public.quotations for each row execute function public.touch_versioned_row();
drop trigger if exists commercial_prices_audit on public.commercial_prices;
create trigger commercial_prices_audit after insert or update or delete on public.commercial_prices for each row execute function public.audit_row_change();
drop trigger if exists quotations_audit on public.quotations;
create trigger quotations_audit after insert or update or delete on public.quotations for each row execute function public.audit_row_change();
drop trigger if exists quotation_items_audit on public.quotation_items;
create trigger quotation_items_audit after insert or update or delete on public.quotation_items for each row execute function public.audit_row_change();

alter table public.commercial_prices enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
create policy commercial_prices_internal_read on public.commercial_prices for select using (public.is_internal_user());
create policy commercial_prices_admin_write on public.commercial_prices for all using (public.can_administer()) with check (public.can_administer());
create policy quotations_internal_read on public.quotations for select using (public.is_internal_user());
create policy quotations_admin_write on public.quotations for all using (public.can_administer()) with check (public.can_administer());
create policy quotation_items_internal_read on public.quotation_items for select using (public.is_internal_user());
create policy quotation_items_admin_write on public.quotation_items for all using (public.can_administer()) with check (public.can_administer());

insert into public.commercial_prices(category,code,label,duration_hours,unit_price,pricing_status,rules) values
('SERVICE','CLASSIC','Classic',2,250000,'DEFINED','{}'),('SERVICE','CLASSIC','Classic',3,290000,'DEFINED','{}'),('SERVICE','CLASSIC','Classic',4,330000,'DEFINED','{}'),
('SERVICE','POLAROID','Polaroid',2,330000,'DEFINED','{}'),('SERVICE','POLAROID','Polaroid',3,390000,'DEFINED','{}'),('SERVICE','POLAROID','Polaroid',4,450000,'DEFINED','{}'),
('SERVICE','BLACK_STUDIO','Black Studio',2,390000,'DEFINED','{}'),('SERVICE','BLACK_STUDIO','Black Studio',3,470000,'DEFINED','{}'),('SERVICE','BLACK_STUDIO','Black Studio',4,520000,'DEFINED','{}'),
('SERVICE','BBOX360','BBOX360',2,250000,'DEFINED','{}'),('SERVICE','BBOX360','BBOX360',3,300000,'DEFINED','{}'),('SERVICE','BBOX360','BBOX360',4,360000,'DEFINED','{}'),
('SERVICE','HASHTAG','Hashtag',2,250000,'DEFINED','{}'),('SERVICE','HASHTAG','Hashtag',3,300000,'DEFINED','{}'),('SERVICE','HASHTAG','Hashtag',4,350000,'DEFINED','{}'),
('SERVICE','LIGHTBOX','LightBox',null,220000,'DEFINED','{"fixed":true}'),('SERVICE','BOOMBALL','BoomBall',null,280000,'DEFINED','{"fixed":true}'),
('SERVICE','INSTABOX','Instabox',null,null,'REQUIRES_QUOTE','{}'),('SERVICE','VIDEO_LOUNGE','Video Lounge',null,null,'REQUIRES_QUOTE','{}'),
('EXTRA','UNLIMITED_MAGNETS','Imanes ilimitados',null,65000,'DEFINED','{}'),('EXTRA','QR','QR corporativo',null,75000,'DEFINED','{"vatExclusive":true}'),
('EXTRA','BRANDING','Branding por cara',null,75000,'DEFINED','{"vatExclusive":true,"minimumQuantity":2}'),('EXTRA','SCRAPBOOK','Scrapbook',null,55000,'DEFINED','{}'),
('EXTRA','ADDITIONAL_OPERATOR','Operador adicional',null,null,'REQUIRES_QUOTE','{}'),('EXTRA','ADDITIONAL_PRINTING','Impresión adicional',null,null,'REQUIRES_QUOTE','{}')
on conflict do nothing;

insert into public.commercial_prices(category,code,label,destination,unit_price,pricing_status,rules) values
('TRANSPORT','SANTIAGO_PROVINCE','Provincia de Santiago','Provincia de Santiago',0,'DEFINED','{}'),
('TRANSPORT','OTHER_SANTIAGO_PROVINCE','Otra provincia de Santiago','Otra provincia de Santiago',35000,'DEFINED','{}'),
('TRANSPORT','CHACABUCO','Chacabuco','Chacabuco',55000,'DEFINED','{}'),('TRANSPORT','CORDILLERA','Cordillera','Cordillera',70000,'DEFINED','{}'),
('TRANSPORT','MAIPO','Maipo','Maipo',60000,'DEFINED','{}'),('TRANSPORT','MELIPILLA','Melipilla','Melipilla',75000,'DEFINED','{}'),
('TRANSPORT','TALAGANTE','Talagante','Talagante',80000,'DEFINED','{}'),('TRANSPORT','INTERIOR_REGIONS','Regiones interiores','Regiones interiores',120000,'DEFINED','{}')
on conflict do nothing;

commit;
