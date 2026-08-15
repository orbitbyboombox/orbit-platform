begin;

create or replace function public.orbit_search_normalize(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select regexp_replace(
    translate(lower(coalesce(p_value, '')), 'áéíóúüñàèìòùäëïöü', 'aeiouunaeiouaeiou'),
    '[^a-z0-9]+', '', 'g'
  )
$$;

create extension if not exists pg_trgm;

create index if not exists customers_global_search_idx on public.customers using gin (
  public.orbit_search_normalize(coalesce(full_name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(rut, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(address, '') || ' ' || coalesce(city, '')) gin_trgm_ops
) where deleted_at is null;

create index if not exists projects_global_search_idx on public.projects using gin (
  public.orbit_search_normalize(coalesce(name, '') || ' ' || coalesce(project_type, '') || ' ' || coalesce(location, '') || ' ' || coalesce(city, '') || ' ' || coalesce(orbit_event_id, '')) gin_trgm_ops
) where deleted_at is null;

create index if not exists quotations_global_search_idx on public.quotations using gin (
  public.orbit_search_normalize(coalesce(quotation_number, '') || ' ' || coalesce(customer_snapshot::text, '') || ' ' || coalesce(commercial_snapshot::text, '')) gin_trgm_ops
) where deleted_at is null;

create or replace function public.search_orbit_global(p_query text, p_limit integer default 8)
returns table(entity_type text, entity_id uuid, title text, subtitle text, relevance integer)
language sql
stable
security invoker
set search_path = public
as $$
  with input as (
    select public.orbit_search_normalize(p_query) term,
           greatest(1, least(coalesce(p_limit, 8), 12)) result_limit,
           public.current_orbit_role() role
  ), candidates as (
    select 'CUSTOMER'::text entity_type, c.id entity_id, c.full_name title,
      concat_ws(' · ', nullif(c.company, ''), nullif(c.email, ''), nullif(c.phone, '')) subtitle,
      case when public.orbit_search_normalize(c.full_name) = i.term then 0
           when public.orbit_search_normalize(c.full_name) like i.term || '%' then 1 else 2 end relevance
    from public.customers c cross join input i
    where length(i.term) >= 2 and i.role in ('CEO','ADMINISTRATOR','SALES','OPERATIONS','READONLY')
      and c.deleted_at is null
      and public.orbit_search_normalize(concat_ws(' ', c.full_name, c.company, c.rut, c.email, c.phone, c.address, c.city)) like '%' || i.term || '%'
    union all
    select 'EVENT', p.id,
      concat_ws(' · ', c.full_name, p.project_type),
      concat_ws(' · ', to_char(p.event_date, 'DD-MM-YYYY'), nullif(p.location, ''), nullif(p.city, ''), nullif(string_agg(ps.service_code, ' + ' order by ps.service_code), '')),
      case when public.orbit_search_normalize(c.full_name) = i.term then 0 else 2 end
    from public.projects p
    join public.customers c on c.id = p.customer_id
    left join public.project_services ps on ps.project_id = p.id
    cross join input i
    where length(i.term) >= 2 and p.deleted_at is null and c.deleted_at is null
      and (
        i.role in ('CEO','ADMINISTRATOR','SALES','OPERATIONS','READONLY')
        or (i.role = 'STAFF' and exists (
          select 1 from public.assignments a join public.staff s on s.id = a.staff_id
          where a.project_id = p.id and a.deleted_at is null and a.status in ('CONFIRMED','ACCEPTED') and s.profile_id = auth.uid()
        ))
      )
    group by p.id, c.full_name, c.company, p.name, p.project_type, p.event_date, p.location, p.city, p.orbit_event_id, i.term
    having public.orbit_search_normalize(concat_ws(' ', c.full_name, c.company, p.name, p.project_type, p.event_date::text, p.location, p.city, p.orbit_event_id, string_agg(ps.service_code, ' ' order by ps.service_code))) like '%' || i.term || '%'
    union all
    select 'QUOTE', q.id,
      concat_ws(' · ', q.quotation_number, coalesce(nullif(c.company, ''), nullif(c.full_name, ''), nullif(q.customer_snapshot->>'company', ''), nullif(q.customer_snapshot->>'contact', ''), 'Cliente')),
      concat_ws(' · ', coalesce(nullif(c.email, ''), nullif(q.customer_snapshot->>'email', '')), trim(to_char(q.grand_total, 'FM$999G999G999G990'))),
      case when public.orbit_search_normalize(q.quotation_number) = i.term then 0 else 2 end
    from public.quotations q
    left join public.customers c on c.id = q.customer_id
    cross join input i
    where length(i.term) >= 2 and i.role in ('CEO','ADMINISTRATOR','SALES','OPERATIONS','READONLY')
      and q.deleted_at is null
      and public.orbit_search_normalize(concat_ws(' ', q.quotation_number, c.full_name, c.company, c.email, q.customer_snapshot::text)) like '%' || i.term || '%'
  ), ranked as (
    select candidates.*, row_number() over(partition by candidates.entity_type order by candidates.relevance, candidates.title, candidates.entity_id) position
    from candidates
  )
  select ranked.entity_type, ranked.entity_id, ranked.title, coalesce(ranked.subtitle, ''), ranked.relevance
  from ranked cross join input
  where ranked.position <= input.result_limit
  order by case ranked.entity_type when 'CUSTOMER' then 1 when 'EVENT' then 2 else 3 end, ranked.relevance, ranked.title;
$$;

revoke all on function public.search_orbit_global(text, integer) from public, anon;
grant execute on function public.search_orbit_global(text, integer) to authenticated;

commit;
