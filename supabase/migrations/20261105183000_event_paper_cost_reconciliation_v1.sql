-- READ-ONLY FINANCIAL RECONCILIATION. No changes to settlements or historical estimates.
-- Staff tariffs: 2026-10-31 and earlier = historical; 2026-11-01 onward = new.
-- Do not infer staff rates from the current cost master; use dated assignment values.
create or replace view public.event_paper_cost_reconciliation_v1
with (security_invoker = true) as
select e.project_id, e.orbit_event_id, p.event_date,
       case when p.event_date < date '2026-11-01' then 'THROUGH_OCT_2026'
            else 'FROM_NOV_2026' end as staff_rate_period,
       e.status as estimate_status, e.paper as estimated_paper_cost,
       e.total as estimated_total, s.status as paper_status,
       s.event_usage as actual_photos,
       case when s.status in ('CONFIRMED','OVERRIDDEN')
         then round(s.event_usage * rate.amount, 2) end as actual_paper_cost,
       case when s.status in ('CONFIRMED','OVERRIDDEN')
         then round(e.paper - s.event_usage * rate.amount, 2) end as paper_variance,
       case when s.status in ('CONFIRMED','OVERRIDDEN')
         then round(e.total - e.paper + s.event_usage * rate.amount, 2) end as provisional_cost_with_actual_paper,
       e.operator as estimated_operator, i.operator_cost as operational_operator,
       case when i.operator_cost is not null then i.operator_cost - e.operator end as operator_variance,
       e.assembly as estimated_assembly, e.disassembly as estimated_disassembly,
       e.transport as estimated_transport, e.fuel as estimated_fuel,
       e.branding as estimated_branding,
       case when s.id is null or s.status not in ('CONFIRMED','OVERRIDDEN') then 'PAPER_NOT_CLOSED'
            when i.project_id is null then 'PERSONNEL_NOT_RECONCILED'
            when abs(coalesce(i.operator_cost,0)-e.operator)>0.01 then 'PERSONNEL_REVIEW'
            when coalesce(e.branding,0)>0 then 'BRANDING_REVIEW'
            else 'PROVISIONAL_NOT_FINAL' end as reconciliation_status
from public.estimated_cost_sheets e
join public.projects p on p.id=e.project_id
left join public.event_paper_snapshots s on s.project_id=e.project_id
left join public.event_operation_cost_intelligence i on i.project_id=e.project_id
cross join lateral (
  select amount from public.cost_master_entries
  where code='COST_PER_PHOTO' and enabled=true and deleted_at is null
  order by updated_at desc limit 1
) rate;
-- This view is intentionally inaccessible to API roles until existing admin
-- authorization and historic rate locking are reviewed.
revoke all on public.event_paper_cost_reconciliation_v1 from public, anon, authenticated;
