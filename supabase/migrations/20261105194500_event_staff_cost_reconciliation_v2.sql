-- v2.1.5 read-only reconciliation. No writes to historical financial records.
-- Source of truth: values recorded on event_staff_payments/payment_items.
-- Event date <= 2026-10-31 keeps historical recorded values; dates >= 2026-11-01
-- use the recorded effective/personalized values and never reprice paid rows.
-- Payment concepts include OPERATOR, SUPERVISOR, ASSEMBLY, DISASSEMBLY and TRAINING;
-- legacy rows are used only when the corresponding concept item is absent.

create or replace view public.event_staff_cost_reconciliation_v2
with (security_invoker = true) as
with item_concepts as (
  select
    i.project_id,
    i.staff_id,
    i.assignment_id,
    i.settlement_id,
    i.concept_code,
    i.amount as recorded_amount,
    i.paid_amount,
    i.status,
    'PAYMENT_ITEM'::text as source,
    i.created_at
  from public.event_staff_payment_items i
  where i.status <> 'CANCELLED'
),
legacy_concepts as (
  select p.project_id,p.staff_id,p.assignment_id,p.id as settlement_id,
         'OPERATOR'::text as concept_code,
         coalesce(p.override_operator_payment,p.operator_payment,0) as recorded_amount,
         coalesce(p.paid_amount,0) as payment_paid_amount,
         p.settlement_status as status,
         'EVENT_STAFF_PAYMENTS'::text as source,
         p.created_at
  from public.event_staff_payments p
  where p.deleted_at is null and p.status <> 'CANCELLED'
  union all
  select p.project_id,p.staff_id,p.assignment_id,p.id,
         'ASSEMBLY',coalesce(p.override_assembly_payment,p.assembly_payment,0),
         coalesce(p.paid_amount,0),p.settlement_status,'EVENT_STAFF_PAYMENTS',p.created_at
  from public.event_staff_payments p
  where p.deleted_at is null and p.status <> 'CANCELLED'
  union all
  select p.project_id,p.staff_id,p.assignment_id,p.id,
         'DISASSEMBLY',coalesce(p.override_disassembly_payment,p.disassembly_payment,0),
         coalesce(p.paid_amount,0),p.settlement_status,'EVENT_STAFF_PAYMENTS',p.created_at
  from public.event_staff_payments p
  where p.deleted_at is null and p.status <> 'CANCELLED'
),
legacy_without_items as (
  select l.*,
         case when sum(l.recorded_amount) over(partition by l.settlement_id)=0 then 0
              else round(l.payment_paid_amount * l.recorded_amount /
                nullif(sum(l.recorded_amount) over(partition by l.settlement_id),0),2) end as paid_amount
  from legacy_concepts l
  where not exists (
    select 1 from item_concepts i
    where i.settlement_id=l.settlement_id and i.concept_code=l.concept_code
  )
),
concepts as (
  select project_id,staff_id,assignment_id,settlement_id,concept_code,
         recorded_amount,paid_amount,status,source,created_at from item_concepts
  union all
  select project_id,staff_id,assignment_id,settlement_id,concept_code,
         recorded_amount,paid_amount,status,source,created_at from legacy_without_items
),
paper_ranked as (
  select s.*,
         row_number() over (
           partition by s.project_id
           order by case when s.status='CONFIRMED' then 0
                         when s.status='OVERRIDDEN' then 1 else 2 end,
                    coalesce(s.confirmed_at,s.overridden_at,s.created_at) desc,
                    s.id desc
         ) as rn
  from public.event_paper_snapshots s
),
paper_canonical as (
  select * from paper_ranked where rn=1
),
estimate as (
  select e.project_id,e.operator,e.assembly,e.disassembly,e.paper,e.total,e.branding,
         case when e.source_snapshot->>'paperUnitCost' ~ '^[0-9]+(\\.[0-9]+)?$'
              then (e.source_snapshot->>'paperUnitCost')::numeric end as snapshot_paper_rate
  from public.estimated_cost_sheets e
),
branding_override as (
  select distinct on (o.project_id) o.project_id,
         coalesce(o.edited_value,o.original_value) as recorded_branding,
         o.reason
  from public.financial_cost_overrides o
  where lower(coalesce(o.category,'')) like '%brand%'
  order by o.project_id,o.created_at desc,o.id desc
),
paper_enriched as (
  select p.project_id,p.status,p.opening_balance,p.event_usage,p.final_remaining_balance,
         case when e.snapshot_paper_rate is not null then e.snapshot_paper_rate
              else (select (h.new_value->>'amount')::numeric
                    from public.cost_master_history h
                    where h.new_value->>'code'='COST_PER_PHOTO'
                      and h.changed_at < pr.event_date + interval '1 day'
                      and h.new_value->>'amount' ~ '^[0-9]+(\\.[0-9]+)?$'
                    order by h.changed_at desc limit 1) end as paper_unit_cost,
         case when e.snapshot_paper_rate is not null then 'EVENT_SNAPSHOT'
              when exists(select 1 from public.cost_master_history h
                          where h.new_value->>'code'='COST_PER_PHOTO'
                            and h.changed_at < pr.event_date + interval '1 day')
                then 'DATED_COST_HISTORY' else 'REVIEW_REQUIRED' end as paper_cost_source
  from paper_canonical p
  join public.projects pr on pr.id=p.project_id
  left join estimate e on e.project_id=p.project_id
),
detail as (
  select c.project_id,pr.orbit_event_id,pr.name as event_name,pr.event_date,
         c.staff_id,concat_ws(' ',st.first_name,st.last_name) as staff_name,
         c.assignment_id,c.settlement_id,c.concept_code,c.recorded_amount,
         c.paid_amount,c.status as payment_status,c.source,
         case when pr.event_date <= date '2026-10-31' then 'HISTORICAL_RECORDED'
              else 'NOV_2026_RECORDED_OR_PERSONALIZED' end as tariff_period,
         case when c.recorded_amount=0 then 'ZERO_RECORDED'
              when c.source='EVENT_STAFF_PAYMENTS' then 'LEGACY_RECORDED_VALUE'
              else 'PAYMENT_ITEM_RECORDED_VALUE' end as explanation
  from concepts c
  join public.projects pr on pr.id=c.project_id and pr.deleted_at is null
  left join public.staff st on st.id=c.staff_id
)
select d.*,
       e.operator as estimated_operator,e.assembly as estimated_assembly,
       e.disassembly as estimated_disassembly,e.paper as estimated_paper_cost,
       e.total as estimated_total,e.branding as estimated_branding,
       coalesce(b.recorded_branding,0) as recorded_branding,
       b.reason as branding_reason,
       pe.status as paper_status,pe.opening_balance,pe.event_usage,
       pe.final_remaining_balance,pe.paper_unit_cost,pe.paper_cost_source,
       case when pe.status in ('CONFIRMED','OVERRIDDEN') and pe.paper_unit_cost is not null
            then round(pe.event_usage*pe.paper_unit_cost,2) end as actual_paper_cost,
       case when pe.status in ('CONFIRMED','OVERRIDDEN') and pe.paper_unit_cost is null
            then 'REVIEW_REQUIRED' else 'AVAILABLE' end as paper_reconciliation_status
from detail d
left join estimate e on e.project_id=d.project_id
left join paper_enriched pe on pe.project_id=d.project_id
left join branding_override b on b.project_id=d.project_id;

create or replace view public.event_cost_reconciliation_v2
with (security_invoker = true) as
select d.project_id,d.orbit_event_id,d.event_name,d.event_date,
       min(d.estimated_total) as estimated_total,
       sum(d.recorded_amount) as staff_cost_real,
       sum(d.paid_amount) as staff_amount_paid,
       sum(d.recorded_amount-d.paid_amount) as staff_amount_pending,
       min(d.estimated_operator) as estimated_operator,
       min(d.estimated_assembly) as estimated_assembly,
       min(d.estimated_disassembly) as estimated_disassembly,
       min(d.estimated_paper_cost) as estimated_paper_cost,
       min(d.actual_paper_cost) as actual_paper_cost,
       min(d.paper_reconciliation_status) as paper_reconciliation_status,
       min(d.recorded_branding) as recorded_branding,
       case when count(*) filter(where d.paper_reconciliation_status='REVIEW_REQUIRED')>0
                 or count(*) filter(where d.concept_code is null)>0
            then 'REVIEW_REQUIRED'
            when count(*) filter(where d.payment_status in ('PAID','FINALIZED'))>0
            then 'HISTORICAL_OR_PARTIALLY_PAID'
            else 'RECONCILED_FROM_RECORDED_VALUES' end as reconciliation_status
from public.event_staff_cost_reconciliation_v2 d
group by d.project_id,d.orbit_event_id,d.event_name,d.event_date;

create or replace function public.get_event_staff_cost_reconciliation(p_project_id uuid)
returns setof public.event_staff_cost_reconciliation_v2
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_administer() then
    raise exception 'Acceso restringido a Founder/Admin.' using errcode='42501';
  end if;
  return query
    select * from public.event_staff_cost_reconciliation_v2
    where project_id=p_project_id;
end;
$$;

revoke all on public.event_staff_cost_reconciliation_v2 from public,anon,authenticated;
revoke all on public.event_cost_reconciliation_v2 from public,anon,authenticated;
revoke all on function public.get_event_staff_cost_reconciliation(uuid) from public,anon;
grant execute on function public.get_event_staff_cost_reconciliation(uuid) to authenticated;

comment on view public.event_staff_cost_reconciliation_v2 is
  'Read-only per-staff/per-concept reconciliation using recorded values; never reprices historical payments.';
