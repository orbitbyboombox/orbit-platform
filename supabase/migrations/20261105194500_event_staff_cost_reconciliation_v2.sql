-- v2.1.5 read-only reconciliation. No writes to historical financial records.
-- All amounts are recorded values. This migration never reprices or mutates
-- paid/finalized settlements.

create or replace view public.event_staff_cost_reconciliation_v2
with (security_invoker = true) as
with item_concepts as (
  select i.project_id, i.staff_id, i.assignment_id, i.settlement_id,
         i.concept_code, i.amount as recorded_amount, i.paid_amount,
         i.status, 'PAYMENT_ITEM'::text as source, i.created_at
    from public.event_staff_payment_items i
   where i.status <> 'CANCELLED'
),
legacy_concepts as (
  select p.project_id, p.staff_id, p.assignment_id, p.id as settlement_id,
         v.concept_code, v.recorded_amount, coalesce(p.paid_amount, 0) as legacy_paid_amount,
         p.settlement_status as status, 'EVENT_STAFF_PAYMENTS'::text as source, p.created_at
    from public.event_staff_payments p
    cross join lateral (values
      ('OPERATOR'::text, coalesce(p.override_operator_payment, p.operator_payment, 0)),
      ('ASSEMBLY'::text, coalesce(p.override_assembly_payment, p.assembly_payment, 0)),
      ('DISASSEMBLY'::text, coalesce(p.override_disassembly_payment, p.disassembly_payment, 0))
    ) v(concept_code, recorded_amount)
   where p.deleted_at is null
     and p.settlement_status <> 'CANCELLED'
     and not exists (
       select 1
         from public.assignments cancelled_assignment
        where cancelled_assignment.id = p.assignment_id
          and (cancelled_assignment.deleted_at is not null
               or cancelled_assignment.status in ('CANCELLED','REJECTED'))
     )
     and v.recorded_amount > 0
),
legacy_without_items as (
  select l.*,
         case when sum(l.recorded_amount) over (partition by l.settlement_id) = 0 then 0
              else round(l.legacy_paid_amount * l.recorded_amount /
                nullif(sum(l.recorded_amount) over (partition by l.settlement_id), 0), 2)
          end as paid_amount
    from legacy_concepts l
   where not exists (
     select 1 from item_concepts i
      where i.concept_code = l.concept_code
        and (
          i.settlement_id = l.settlement_id
          or (i.settlement_id is null
              and i.project_id = l.project_id
              and i.staff_id = l.staff_id
              and i.assignment_id = l.assignment_id)
        )
   )
),
concepts as (
  select project_id, staff_id, assignment_id, settlement_id, concept_code,
         recorded_amount, paid_amount, status, source, created_at
    from item_concepts
  union all
  select project_id, staff_id, assignment_id, settlement_id, concept_code,
         recorded_amount, paid_amount, status, source, created_at
    from legacy_without_items
),
paper_ranked as (
  select s.*, row_number() over (
    partition by s.project_id
    order by case when s.status = 'CONFIRMED' then 0
                       when s.status = 'OVERRIDDEN' then 1 else 2 end,
             coalesce(s.confirmed_at, s.overridden_at, s.created_at) desc,
             s.id desc
  ) as rn
    from public.event_paper_snapshots s
),
paper_canonical as (
  select * from paper_ranked where rn = 1
),
estimate as (
  select e.project_id, e.operator, e.assembly, e.disassembly, e.paper, e.total,
         e.branding,
         case when e.source_snapshot->>'paperUnitCost' ~ '^[0-9]+(\\.[0-9]+)?$'
              then (e.source_snapshot->>'paperUnitCost')::numeric end as snapshot_paper_rate
    from public.estimated_cost_sheets e
),
branding_override as (
  select distinct on (o.project_id) o.project_id,
         coalesce(o.edited_value, o.original_value) as recorded_branding,
         o.reason
    from public.financial_cost_overrides o
   where lower(coalesce(o.category, '')) like '%brand%'
   order by o.project_id, o.created_at desc, o.id desc
),
paper_enriched as (
  select p.project_id, p.status, p.opening_balance, p.event_usage,
         p.final_remaining_balance,
         case when e.snapshot_paper_rate is not null then e.snapshot_paper_rate
              else (select (h.new_value->>'amount')::numeric
                      from public.cost_master_history h
                     where h.new_value->>'code' = 'COST_PER_PHOTO'
                       and h.changed_at < pr.event_date + interval '1 day'
                       and h.new_value->>'amount' ~ '^[0-9]+(\\.[0-9]+)?$'
                     order by h.changed_at desc limit 1)
          end as paper_unit_cost,
         case when e.snapshot_paper_rate is not null then 'EVENT_SNAPSHOT'
              when exists (select 1 from public.cost_master_history h
                            where h.new_value->>'code' = 'COST_PER_PHOTO'
                              and h.changed_at < pr.event_date + interval '1 day')
              then 'DATED_COST_HISTORY' else 'REVIEW_REQUIRED' end as paper_cost_source
    from paper_canonical p
    join public.projects pr on pr.id = p.project_id
    left join estimate e on e.project_id = p.project_id
),
detail as (
  select c.project_id, pr.orbit_event_id, pr.name as event_name, pr.event_date,
         c.staff_id, concat_ws(' ', st.first_name, st.last_name) as staff_name,
         c.assignment_id, c.settlement_id, c.concept_code, c.recorded_amount,
         c.paid_amount, c.status as payment_status, c.source,
         case when pr.event_date <= date '2026-10-31' then 'HISTORICAL_RECORDED'
              else 'NOV_2026_RECORDED_OR_PERSONALIZED' end as tariff_period,
         case when c.recorded_amount = 0 then 'ZERO_RECORDED'
              when c.source = 'EVENT_STAFF_PAYMENTS' then 'LEGACY_RECORDED_VALUE'
              else 'PAYMENT_ITEM_RECORDED_VALUE' end as explanation
    from concepts c
    join public.projects pr on pr.id = c.project_id and pr.deleted_at is null
    left join public.staff st on st.id = c.staff_id
),
event_scope as (
  select p.id as project_id, p.orbit_event_id, p.name as event_name, p.event_date
    from public.projects p
   where p.deleted_at is null
)
select s.project_id, s.orbit_event_id, s.event_name, s.event_date,
       d.staff_id, d.staff_name, d.assignment_id, d.settlement_id,
       d.concept_code, d.recorded_amount, d.paid_amount, d.payment_status,
       d.source, d.tariff_period, d.explanation,
       e.operator as estimated_operator, e.assembly as estimated_assembly,
       e.disassembly as estimated_disassembly, e.paper as estimated_paper_cost,
       e.total as estimated_total, e.branding as estimated_branding,
       coalesce(b.recorded_branding, 0) as recorded_branding,
       b.reason as branding_reason,
       pe.status as paper_status, pe.opening_balance, pe.event_usage,
       pe.final_remaining_balance, pe.paper_unit_cost, pe.paper_cost_source,
       case when pe.status in ('CONFIRMED','OVERRIDDEN') and pe.paper_unit_cost is not null
            then round(pe.event_usage * pe.paper_unit_cost, 2) end as actual_paper_cost,
       case when pe.status in ('CONFIRMED','OVERRIDDEN') and pe.paper_unit_cost is null
            then 'REVIEW_REQUIRED' else 'AVAILABLE' end as paper_reconciliation_status
  from event_scope s
  left join detail d on d.project_id = s.project_id
  left join estimate e on e.project_id = s.project_id
  left join paper_enriched pe on pe.project_id = s.project_id
  left join branding_override b on b.project_id = s.project_id;

create or replace view public.event_cost_reconciliation_v2
with (security_invoker = true) as
select d.project_id, d.orbit_event_id, d.event_name, d.event_date,
       min(d.estimated_total) as estimated_total,
       coalesce(sum(d.recorded_amount), 0) as staff_cost_real,
       coalesce(sum(d.paid_amount), 0) as staff_amount_paid,
       coalesce(sum(d.recorded_amount - d.paid_amount), 0) as staff_amount_pending,
       min(d.estimated_operator) as estimated_operator,
       min(d.estimated_assembly) as estimated_assembly,
       min(d.estimated_disassembly) as estimated_disassembly,
       min(d.estimated_paper_cost) as estimated_paper_cost,
       min(d.actual_paper_cost) as actual_paper_cost,
       min(d.paper_reconciliation_status) as paper_reconciliation_status,
       min(d.recorded_branding) as recorded_branding,
       case when count(*) filter (where d.staff_id is null) > 0
              then 'NO_STAFF_PAYMENT_RECORDS'
            when count(*) filter (where d.paper_reconciliation_status = 'REVIEW_REQUIRED') > 0
              then 'REVIEW_REQUIRED'
            when count(*) filter (where d.payment_status in ('PAID','FINALIZED')) > 0
              then 'HISTORICAL_OR_PARTIALLY_PAID'
            else 'RECONCILED_FROM_RECORDED_VALUES' end as reconciliation_status
  from public.event_staff_cost_reconciliation_v2 d
 group by d.project_id, d.orbit_event_id, d.event_name, d.event_date;

-- Read-only normalized expense classification. It does not replace the
-- existing purchase/expense module and never treats missing data as zero.
create or replace view public.event_finance_costs_v2
with (security_invoker = true) as
select e.id as source_id, e.project_id, e.occurred_on,
       case
         when upper(e.category) in ('STAFF','PAYROLL','OPERATOR','SUPERVISOR','ASSEMBLY','DISASSEMBLY','TRAINING','TRAVEL_ALLOWANCE') then 'PERSONAL_Y_OPERACIONES'
         when upper(e.category) in ('PAPER','INK','CONSUMABLES','SUPPLIES','MATERIALS') then 'INSUMOS_Y_PRODUCCION'
         when upper(e.category) in ('FUEL','TOLL','PARKING','TRANSPORT','VEHICLE') then 'TRANSPORTE_Y_LOGISTICA'
         when upper(e.category) in ('PHONE','INTERNET','SOFTWARE','OFFICE','ADMINISTRATION') then 'ADMINISTRACION_Y_OFICINA'
         when upper(e.category) in ('REPAIR','EQUIPMENT','CAMERA','PRINTER','TOTEM','MAINTENANCE') then 'EQUIPOS_Y_MANTENIMIENTO'
         when upper(e.category) in ('ADS','MARKETING','DESIGN','COMMISSIONS') then 'COMERCIAL_Y_MARKETING'
         else 'REVIEW_REQUIRED'
       end as area,
       e.category as subcategory, e.supplier, e.total as amount,
       case when e.status in ('PAID','APPROVED','SETTLED') then 'PAID'
            when e.status in ('CANCELLED','REJECTED') then 'CANCELLED'
            else 'PENDING' end as payment_state,
       'EXPENSE'::text as source
  from public.expenses e
 where e.deleted_at is null
union all
select null::uuid, r.project_id, null::date,
       'PERSONAL_Y_OPERACIONES', r.concept_code, null,
       r.recorded_amount, case when r.paid_amount >= r.recorded_amount then 'PAID' else 'PENDING' end,
       'STAFF_RECONCILIATION'
  from public.event_staff_cost_reconciliation_v2 r
 where r.staff_id is not null;

create or replace view public.event_profitability_reconciliation_v2
with (security_invoker = true) as
select p.id as project_id, p.orbit_event_id, p.name as event_name, p.event_date,
       fer.revenue as contracted_net_revenue,
       coalesce(c.estimated_total, 0) as estimated_cost,
       coalesce(c.staff_cost_real, 0) + coalesce(c.actual_paper_cost, 0) as known_real_cost,
       coalesce(c.staff_amount_paid, 0) as staff_paid,
       coalesce(c.staff_amount_pending, 0) as staff_pending,
       case when c.paper_reconciliation_status = 'REVIEW_REQUIRED' then 'REVIEW_REQUIRED'
            when c.project_id is null then 'REVIEW_REQUIRED'
            else 'PARTIAL_KNOWN_COST' end as completeness_status,
       case when fer.revenue is not null
            then fer.revenue - (coalesce(c.staff_cost_real,0) + coalesce(c.actual_paper_cost,0)) end as gross_profit_known,
       case when fer.revenue is not null and fer.revenue <> 0
            then round((fer.revenue - (coalesce(c.staff_cost_real,0) + coalesce(c.actual_paper_cost,0))) / fer.revenue * 100, 2) end as gross_margin_known_pct
  from public.projects p
  left join public.financial_event_records fer on fer.project_id = p.id
  left join public.event_cost_reconciliation_v2 c on c.project_id = p.id
 where p.deleted_at is null;

create or replace function public.get_event_staff_cost_reconciliation(p_project_id uuid)
returns setof public.event_staff_cost_reconciliation_v2
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.can_administer() then
    raise exception 'Acceso restringido a Founder/Admin.' using errcode = '42501';
  end if;
  return query select * from public.event_staff_cost_reconciliation_v2 where project_id = p_project_id;
end;
$$;

revoke all on public.event_staff_cost_reconciliation_v2 from public, anon, authenticated;
revoke all on public.event_cost_reconciliation_v2 from public, anon, authenticated;
revoke all on public.event_finance_costs_v2 from public, anon, authenticated;
revoke all on public.event_profitability_reconciliation_v2 from public, anon, authenticated;
revoke all on function public.get_event_staff_cost_reconciliation(uuid) from public, anon;
grant execute on function public.get_event_staff_cost_reconciliation(uuid) to authenticated;

comment on view public.event_staff_cost_reconciliation_v2 is
  'Read-only per-staff/per-concept reconciliation using recorded values; never reprices historical payments.';
comment on view public.event_finance_costs_v2 is
  'Read-only normalized expense classification; REVIEW_REQUIRED is explicit and never treated as zero.';
