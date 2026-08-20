begin;

-- Global navigation search remains a SECURITY INVOKER read model. Authorization
-- is derived from ORBIT's canonical profile helpers and table RLS, not from a
-- duplicated list of management roles.
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
           public.current_orbit_role() role,
           public.is_internal_user() is_internal
  ), manager_access as (
    select i.* from input i where i.is_internal and i.role <> 'STAFF'
  ), candidates as (
    select 'CUSTOMER'::text entity_type, c.id entity_id,
      coalesce(nullif(c.full_name, ''), 'Cliente') title,
      concat_ws(' · ', nullif(c.email, ''), nullif(c.phone, ''), nullif(c.rut, '')) subtitle,
      case when public.orbit_search_normalize(c.full_name) = i.term then 0
           when public.orbit_search_normalize(c.full_name) like i.term || '%' then 1 else 2 end relevance
    from public.customers c cross join manager_access i
    where length(i.term) >= 2 and c.deleted_at is null
      and public.orbit_search_normalize(concat_ws(' ', c.full_name, c.email, c.phone, c.rut)) like '%' || i.term || '%'

    union all

    select 'COMPANY'::text, c.id,
      c.company,
      concat_ws(' · ', nullif(c.full_name, ''), nullif(c.email, ''), nullif(c.phone, '')),
      case when public.orbit_search_normalize(c.company) = i.term then 0
           when public.orbit_search_normalize(c.company) like i.term || '%' then 1 else 2 end
    from public.customers c cross join manager_access i
    where length(i.term) >= 2 and c.deleted_at is null and nullif(trim(c.company), '') is not null
      and public.orbit_search_normalize(c.company) <> public.orbit_search_normalize(c.full_name)
      and public.orbit_search_normalize(c.company) like '%' || i.term || '%'

    union all

    select 'EVENT'::text, p.id,
      coalesce(nullif(p.orbit_event_id, ''), nullif(p.name, ''), 'Evento'),
      concat_ws(' · ', nullif(c.full_name, ''), nullif(c.company, ''), to_char(p.event_date, 'DD-MM-YYYY'),
        nullif(string_agg(distinct ps.service_code, ' + ' order by ps.service_code), '')),
      case when public.orbit_search_normalize(p.orbit_event_id) = i.term then 0
           when public.orbit_search_normalize(c.full_name) = i.term or public.orbit_search_normalize(c.company) = i.term then 1 else 2 end
    from public.projects p
    join public.customers c on c.id = p.customer_id
    left join public.project_services ps on ps.project_id = p.id
    cross join input i
    where length(i.term) >= 2 and p.deleted_at is null and c.deleted_at is null
      and upper(coalesce(p.status, '')) not in ('CANCELLED','CANCELED','ARCHIVED')
      and (
        (i.is_internal and i.role <> 'STAFF')
        or (i.role = 'STAFF' and exists (
          select 1 from public.assignments a
          join public.staff s on s.id = a.staff_id
          where a.project_id = p.id and a.deleted_at is null
            and a.status in ('CONFIRMED','ACCEPTED') and s.profile_id = auth.uid()
        ))
      )
    group by p.id, c.full_name, c.company, p.name, p.event_date, p.orbit_event_id, i.term
    having public.orbit_search_normalize(concat_ws(' ', c.full_name, c.company, p.name, p.project_type,
      p.event_date::text, p.location, p.city, p.orbit_event_id,
      string_agg(ps.service_code, ' ' order by ps.service_code))) like '%' || i.term || '%'

    union all

    select 'QUOTE'::text, q.id,
      concat_ws(' · ', q.quotation_number, coalesce(nullif(c.company, ''), nullif(c.full_name, ''),
        nullif(q.customer_snapshot->>'company', ''), nullif(q.customer_snapshot->>'contact', ''), 'Cliente')),
      concat_ws(' · ', coalesce(nullif(c.email, ''), nullif(q.customer_snapshot->>'email', '')),
        trim(to_char(q.grand_total, 'FM$999G999G999G990'))),
      case when public.orbit_search_normalize(q.quotation_number) = i.term then 0 else 2 end
    from public.quotations q
    left join public.customers c on c.id = q.customer_id
    cross join manager_access i
    where length(i.term) >= 2 and q.deleted_at is null
      and public.orbit_search_normalize(concat_ws(' ', q.quotation_number, c.full_name, c.company, c.email,
        q.customer_snapshot::text)) like '%' || i.term || '%'
  ), ranked as (
    select candidates.*,
      row_number() over(partition by candidates.entity_type order by candidates.relevance, candidates.title, candidates.entity_id) position
    from candidates
  )
  select ranked.entity_type, ranked.entity_id, ranked.title, coalesce(ranked.subtitle, ''), ranked.relevance
  from ranked cross join input
  where ranked.position <= input.result_limit
  order by case ranked.entity_type when 'CUSTOMER' then 1 when 'COMPANY' then 2 when 'EVENT' then 3 else 4 end,
    ranked.relevance, ranked.title;
$$;

revoke all on function public.search_orbit_global(text, integer) from public, anon;
grant execute on function public.search_orbit_global(text, integer) to authenticated;

commit;
