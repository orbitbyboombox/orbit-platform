create or replace function public.sync_box_master_and_future_events_after_paper_close()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  future_row record;
  current_project record;
  has_current_assignment boolean;
begin
  if new.status not in ('CONFIRMED','OVERRIDDEN')
     or new.final_remaining_balance is null
     or new.box_asset_id is null then
    return new;
  end if;

  if old.status in ('CONFIRMED','OVERRIDDEN')
     and old.final_remaining_balance is not distinct from new.final_remaining_balance then
    return new;
  end if;

  update public.asset_assignments
  set assignment_status = 'RETURNED',
      returned_at = coalesce(returned_at, now()),
      return_condition = coalesce(return_condition, 'OK'),
      return_notes = coalesce(nullif(return_notes,''), 'Retorno automático al confirmar cierre de papel.'),
      updated_at = now()
  where id = new.asset_assignment_id
    and assignment_status = 'ASSIGNED'
    and deleted_at is null;

  select exists(
    select 1
    from public.asset_assignments aa
    where aa.asset_id = new.box_asset_id
      and aa.id <> new.asset_assignment_id
      and aa.assignment_status = 'ASSIGNED'
      and aa.deleted_at is null
      and aa.planned_start_at is not null
      and aa.planned_end_at is not null
      and aa.planned_start_at <= now()
      and aa.planned_end_at > now()
  ) into has_current_assignment;

  update public.operational_assets
  set status = case when has_current_assignment then 'ASSIGNED' else 'AVAILABLE' end
  where id = new.box_asset_id
    and status not in ('MAINTENANCE','OUT_OF_SERVICE');

  select id,event_date,event_time
  into current_project
  from public.projects
  where id = new.project_id;

  for future_row in
    select eps.project_id, eps.asset_assignment_id
    from public.event_paper_snapshots eps
    join public.projects p on p.id = eps.project_id
    where eps.box_asset_id = new.box_asset_id
      and eps.id <> new.id
      and eps.status = 'PENDING'
      and eps.final_remaining_balance is null
      and eps.event_usage is null
      and (
        p.event_date > current_project.event_date
        or (
          p.event_date = current_project.event_date
          and coalesce(p.event_time,'00:00:00'::time) > coalesce(current_project.event_time,'00:00:00'::time)
        )
      )
    order by p.event_date, p.event_time nulls last
  loop
    perform public.rebase_pending_event_paper_snapshot(
      future_row.project_id,
      future_row.asset_assignment_id
    );
  end loop;

  return new;
end
$function$;

drop trigger if exists event_paper_master_chain_sync on public.event_paper_snapshots;

create trigger event_paper_master_chain_sync
after update of status, final_remaining_balance on public.event_paper_snapshots
for each row
when (new.status in ('CONFIRMED','OVERRIDDEN'))
execute function public.sync_box_master_and_future_events_after_paper_close();
