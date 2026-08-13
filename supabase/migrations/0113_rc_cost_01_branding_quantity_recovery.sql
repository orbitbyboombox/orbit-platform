begin;

-- Legacy reservations stored the commercial Branding total but flattened the
-- selected face quantity to a generic `Branding` extra. Recover the canonical
-- quantity from the accepted quotation snapshot before falling back to one.
create or replace function public.event_branding_faces(p_project_id uuid)
returns numeric
language sql
stable
security definer
set search_path=public
as $$
  with project_value as (
    select nullif(regexp_replace(coalesce(p.operations->>'brandingFaces',''),'[^0-9.]','','g'),'')::numeric as faces
    from public.projects p
    where p.id=p_project_id
  ), service_extras as (
    select
      value,
      nullif(regexp_replace(value,'[^0-9]','','g'),'')::numeric as explicit_faces
    from public.project_services ps
    cross join lateral jsonb_array_elements_text(coalesce(ps.extras,'[]'::jsonb)) item(value)
    where ps.project_id=p_project_id and upper(value) like '%BRANDING%'
  ), accepted_quote as (
    select q.id,q.pricing_snapshot
    from public.quotations q
    where q.project_id=p_project_id and q.status='ACCEPTED' and q.deleted_at is null
    order by q.approved_at desc nulls last,q.created_at desc
    limit 1
  ), quote_values as (
    select
      greatest(coalesce(max(qi.quantity),0),coalesce(max(
        round(greatest(
          coalesce((aq.pricing_snapshot->>'officialExtras')::numeric,0)
            - coalesce((select sum(other.official_total) from public.quotation_items other where other.quotation_id=aq.id and other.item_type='EXTRA' and upper(other.code)<>'BRANDING'),0),
          qi.official_total
        )/nullif(qi.official_unit_price,0))
      ),0)) as faces
    from accepted_quote aq
    join public.quotation_items qi on qi.quotation_id=aq.id and upper(qi.code)='BRANDING'
  )
  select greatest(
    coalesce((select max(faces) from project_value),0),
    coalesce((select max(explicit_faces) from service_extras),0),
    coalesce((select max(faces) from quote_values),0),
    case when exists(select 1 from service_extras) then 1 else 0 end
  );
$$;

-- Rows affected by the first migration received a zero historical placeholder.
-- They never had an official Branding operational tariff before RC-COST-01, so
-- snapshot the new official rate now and preserve it from subsequent edits.
update public.estimated_cost_sheets e
set branding_rate_locked=false
where public.event_branding_faces(e.project_id)>0
  and e.branding_unit_cost=0;

select public.sync_estimated_cost_sheet(e.project_id)
from public.estimated_cost_sheets e
where public.event_branding_faces(e.project_id)>0
  and not e.branding_rate_locked;

commit;
