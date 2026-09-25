begin;

alter table public.customers
  add column if not exists phone_e164 text,
  add column if not exists phone_e164_status text not null default 'EMPTY';

create or replace function public.normalize_phone_e164(p_value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  compact text;
begin
  if p_value is null or nullif(trim(p_value), '') is null then
    return null;
  end if;
  compact := regexp_replace(trim(p_value), '[[:space:]()\-]', '', 'g');
  if compact ~ '^\+[0-9]{8,15}$' then
    return compact;
  end if;
  return null;
end;
$$;

revoke all on function public.normalize_phone_e164(text) from public, anon;
grant execute on function public.normalize_phone_e164(text) to authenticated, service_role;

with candidates as (
  select c.id,
         public.normalize_phone_e164(c.phone) as canonical,
         nullif(trim(c.phone), '') as raw_phone,
         regexp_replace(trim(coalesce(c.phone, '')), '[[:space:]()\-]', '', 'g') as compact
  from public.customers c
), duplicates as (
  select canonical
  from candidates
  where canonical is not null
  group by canonical
  having count(*) > 1
)
update public.customers c
set phone_e164 = case when d.canonical is not null and d.canonical not in (select canonical from duplicates) then d.canonical end,
    phone_e164_status = case
      when d.raw_phone is null then 'EMPTY'
      when d.canonical is not null and d.canonical in (select canonical from duplicates) then 'DUPLICATE_REVIEW'
      when d.canonical is not null and d.compact = d.raw_phone then 'VALID_E164'
      when d.canonical is not null then 'NORMALIZABLE'
      when d.compact ~ '^\+' then 'INVALID'
      when d.compact ~ '^[0-9]+$' then 'AMBIGUOUS'
      else 'INVALID'
    end
from candidates d
where c.id = d.id;

alter table public.customers drop constraint if exists customers_phone_e164_check;
alter table public.customers add constraint customers_phone_e164_check
check (phone_e164 is null or phone_e164 ~ '^\+[0-9]{8,15}$');

alter table public.customers drop constraint if exists customers_phone_e164_status_check;
alter table public.customers add constraint customers_phone_e164_status_check
check (phone_e164_status in ('VALID_E164','NORMALIZABLE','AMBIGUOUS','INVALID','EMPTY','DUPLICATE_REVIEW'));

create unique index if not exists customers_phone_e164_unique_idx
  on public.customers(phone_e164)
  where deleted_at is null and phone_e164 is not null;

create index if not exists customers_phone_e164_search_idx
  on public.customers(phone_e164)
  where deleted_at is null;

commit;
