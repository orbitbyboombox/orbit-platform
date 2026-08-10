begin;

create table if not exists public.staff_payment_months(
  id uuid primary key default gen_random_uuid(),staff_id uuid not null references public.staff(id),month date not null,
  tax_amount numeric(14,2) not null default 0 check(tax_amount>=0),advances numeric(14,2) not null default 0 check(advances>=0),paid_amount numeric(14,2) not null default 0 check(paid_amount>=0),
  status text not null default 'PENDING' check(status in('PENDING','PARTIALLY_PAID','PAID')),version integer not null default 1,
  created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_by uuid references auth.users(id),updated_at timestamptz not null default now(),unique(staff_id,month),check(date_trunc('month',month)::date=month)
);
create table if not exists public.staff_payment_advances(
  id uuid primary key default gen_random_uuid(),payment_month_id uuid not null references public.staff_payment_months(id),amount numeric(14,2) not null check(amount>0),notes text,created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create table if not exists public.staff_payment_documents(
  id uuid primary key default gen_random_uuid(),payment_month_id uuid not null references public.staff_payment_months(id),document_type text not null check(document_type in('HONORARIOS','PAYMENT_PROOF','ADVANCE_PROOF')),storage_bucket text not null default 'orbit-documents',storage_path text not null,file_name text not null,mime_type text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index if not exists staff_payment_months_staff_idx on public.staff_payment_months(staff_id,month desc);
create index if not exists staff_payment_documents_month_idx on public.staff_payment_documents(payment_month_id,created_at desc);
drop trigger if exists staff_payment_months_touch on public.staff_payment_months;create trigger staff_payment_months_touch before update on public.staff_payment_months for each row execute function public.touch_versioned_row();
drop trigger if exists staff_payment_months_audit on public.staff_payment_months;create trigger staff_payment_months_audit after insert or update or delete on public.staff_payment_months for each row execute function public.audit_row_change();
drop trigger if exists staff_payment_advances_audit on public.staff_payment_advances;create trigger staff_payment_advances_audit after insert or update or delete on public.staff_payment_advances for each row execute function public.audit_row_change();
drop trigger if exists staff_payment_documents_audit on public.staff_payment_documents;create trigger staff_payment_documents_audit after insert or update or delete on public.staff_payment_documents for each row execute function public.audit_row_change();
alter table public.staff_payment_months enable row level security;alter table public.staff_payment_advances enable row level security;alter table public.staff_payment_documents enable row level security;
create policy staff_payment_months_internal_read on public.staff_payment_months for select using(public.is_internal_user());create policy staff_payment_months_admin_write on public.staff_payment_months for all using(public.can_administer())with check(public.can_administer());
create policy staff_payment_advances_internal_read on public.staff_payment_advances for select using(public.is_internal_user());create policy staff_payment_advances_admin_write on public.staff_payment_advances for all using(public.can_administer())with check(public.can_administer());
create policy staff_payment_documents_internal_read on public.staff_payment_documents for select using(public.is_internal_user());create policy staff_payment_documents_admin_write on public.staff_payment_documents for all using(public.can_administer())with check(public.can_administer());

commit;
