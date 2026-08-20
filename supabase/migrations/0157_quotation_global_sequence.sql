begin;

do $$
begin
  if exists (
    select 1
    from public.quotations q
    where q.quotation_number ~ '^[0-9]{4}-[0-9]+$'
      and split_part(q.quotation_number, '-', 2)::bigint >= 820
  ) then
    raise exception 'A canonical quotation sequence >= 820 already exists; Founder seed cannot be installed safely.';
  end if;
end;
$$;

create table public.quotation_global_counter (
  singleton_key text primary key check (singleton_key = 'GLOBAL'),
  next_value bigint not null check (next_value >= 820),
  updated_at timestamptz not null default now()
);

insert into public.quotation_global_counter(singleton_key, next_value)
values ('GLOBAL', 820);

create table public.quotation_number_allocations (
  quotation_id uuid primary key,
  sequence_value bigint not null unique check (sequence_value >= 820),
  issue_year integer not null check (issue_year between 2026 and 2200),
  quotation_number text not null unique,
  allocated_at timestamptz not null default now(),
  check (quotation_number = issue_year::text || '-' || sequence_value::text)
);

create or replace function public.allocate_quotation_number(
  p_quotation_id uuid,
  p_issue_date date default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing text;
  v_sequence bigint;
  v_year integer;
begin
  if p_quotation_id is null then
    raise exception 'quotation_id is required';
  end if;

  select a.quotation_number into v_existing
  from public.quotation_number_allocations a
  where a.quotation_id = p_quotation_id;
  if found then return v_existing; end if;

  v_year := extract(year from coalesce(p_issue_date, (current_timestamp at time zone 'America/Santiago')::date));

  select c.next_value into v_sequence
  from public.quotation_global_counter c
  where c.singleton_key = 'GLOBAL'
  for update;
  if not found then raise exception 'Global quotation counter is not configured'; end if;

  insert into public.quotation_number_allocations(quotation_id, sequence_value, issue_year, quotation_number)
  values (p_quotation_id, v_sequence, v_year, v_year::text || '-' || v_sequence::text)
  returning quotation_number into v_existing;

  update public.quotation_global_counter
  set next_value = v_sequence + 1, updated_at = now()
  where singleton_key = 'GLOBAL';

  return v_existing;
exception
  when unique_violation then
    select a.quotation_number into v_existing
    from public.quotation_number_allocations a
    where a.quotation_id = p_quotation_id;
    if v_existing is not null then return v_existing; end if;
    raise;
end;
$$;

create or replace function public.assign_quotation_global_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.quotation_number := public.allocate_quotation_number(new.id, new.issue_date);
  return new;
end;
$$;

drop trigger if exists quotations_assign_global_number on public.quotations;
create trigger quotations_assign_global_number
before insert on public.quotations
for each row execute function public.assign_quotation_global_number();

create unique index if not exists quotations_professional_number_uidx
on public.quotations(quotation_number);

alter table public.quotation_global_counter enable row level security;
alter table public.quotation_number_allocations enable row level security;
revoke all on table public.quotation_global_counter from public, anon, authenticated;
revoke all on table public.quotation_number_allocations from public, anon, authenticated;
revoke all on function public.allocate_quotation_number(uuid,date) from public, anon;
grant execute on function public.allocate_quotation_number(uuid,date) to authenticated, service_role;
revoke all on function public.assign_quotation_global_number() from public, anon, authenticated;

comment on function public.allocate_quotation_number(uuid,date) is
'Canonical idempotent allocator: issue year in America/Santiago plus one perpetual global sequence.';

commit;
