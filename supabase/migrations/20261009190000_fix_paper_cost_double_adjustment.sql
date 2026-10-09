begin;

-- The canonical operation-cost writer already includes confirmed paper in
-- operational_resources_cost, total_operational_cost and real_cost. The
-- previous paper-only writer subtracted paper a second time, which could make
-- real_cost differ from total_operational_cost after a trigger-order change.
-- Keep the function for compatibility, but delegate to the canonical writer.
create or replace function public.sync_event_paper_cost_financials(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  paper jsonb;
  truth public.financial_event_records%rowtype;
begin
  perform public.sync_event_operation_cost(p_project_id);
  paper := public.calculate_event_paper_cost(p_project_id);
  select * into truth
  from public.financial_event_records
  where project_id = p_project_id;

  if not found then
    return jsonb_build_object('updated', false, 'reason', 'NO_FINANCIAL_RECORD', 'paper', paper);
  end if;

  return jsonb_build_object(
    'updated', true,
    'reviewRequired', coalesce((paper->>'reviewRequired')::boolean, true),
    'paper', paper,
    'totalOperationalCost', truth.total_operational_cost,
    'realCost', truth.real_cost
  );
end;
$$;

-- One canonical recalculation per close. sync_event_profitability calls the
-- canonical operation-cost writer and refreshes the profitability statement;
-- it must not be followed by a second paper-only arithmetic adjustment.
create or replace function public.sync_profitability_after_paper_closeout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null
     and new.status in ('CONFIRMED', 'OVERRIDDEN')
     and new.event_usage is not null
     and (
       old.status is distinct from new.status
       or old.event_usage is distinct from new.event_usage
       or old.final_remaining_balance is distinct from new.final_remaining_balance
     ) then
    perform public.sync_event_profitability(new.project_id);
  end if;
  return new;
end;
$$;

revoke all on function public.sync_event_paper_cost_financials(uuid) from public, anon, authenticated;
grant execute on function public.sync_event_paper_cost_financials(uuid) to service_role;

-- Deliberately no historical UPDATE/DO block here. Historical rows require
-- an explicit, reviewed reconciliation; this migration only fixes future and
-- explicitly invoked recalculations.

commit;
