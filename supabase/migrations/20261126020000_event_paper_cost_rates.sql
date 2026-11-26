-- Event-specific paper rates keep historical events and Cost Master unchanged.
create table public.event_paper_cost_rates (
  project_id uuid not null references public.projects(id),
  format_key text not null,
  unit_cost numeric not null check (unit_cost > 0),
  reason text not null,
  created_at timestamptz not null default now(),
  primary key (project_id, format_key)
);
alter table public.event_paper_cost_rates enable row level security;
revoke all on public.event_paper_cost_rates from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.calculate_event_paper_cost(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  paper_row record;
  unit_row record;
  event_unit_cost numeric;
  total_usage numeric := 0;
  total_cost numeric := 0;
  review_required boolean := false;
  format_details jsonb := '[]'::jsonb;
  source_complete boolean := false;
begin
  select (
    (select count(*) from public.event_paper_snapshots s where s.project_id=p_project_id and s.paper_required and s.status in ('CONFIRMED','OVERRIDDEN')) > 0
    and (select count(*) from public.event_operational_blocks b where b.project_id=p_project_id) > 1
    and (select count(*) from public.event_box_paper_block_closeouts c where c.project_id=p_project_id) =
      (select count(*) from public.event_paper_snapshots s where s.project_id=p_project_id and s.paper_required and s.status in ('CONFIRMED','OVERRIDDEN')) *
      (select count(*) from public.event_operational_blocks b where b.project_id=p_project_id)
    and (select count(*) from public.event_box_paper_block_closeouts c
      join public.event_operational_blocks b on b.id=c.block_id
      where c.project_id=p_project_id and b.sequence=(select max(z.sequence) from public.event_operational_blocks z where z.project_id=p_project_id)
        and b.status='COMPLETED' and c.inventory_reconciled_at is not null) =
      (select count(*) from public.event_paper_snapshots s where s.project_id=p_project_id and s.paper_required and s.status in ('CONFIRMED','OVERRIDDEN'))
  ) into source_complete;
  for paper_row in
    select raw.format_key, coalesce(sum(raw.usage),0) as usage, count(*) as snapshot_count
    from (
      select coalesce(nullif(trim(s.format_key),''), nullif(trim(s.black_box_paper_format),''),'UNKNOWN') as format_key,
        s.event_usage as usage
      from public.event_paper_snapshots s
      where not source_complete and s.project_id=p_project_id and s.status in ('CONFIRMED','OVERRIDDEN')
        and s.event_usage is not null
      union all
      select coalesce(nullif(trim(s.format_key),''),
        case when s.paper_variant in ('NORMAL_4X6','PRECUT_4X6') then '4X6' else null end,
        nullif(trim(s.black_box_paper_format),''),'UNKNOWN') as format_key,
        c.used::numeric as usage
      from public.event_box_paper_block_closeouts c
      join public.event_paper_snapshots s on s.project_id=c.project_id and s.box_asset_id=c.asset_id
      where source_complete and c.project_id=p_project_id and s.paper_required
        and s.status in ('CONFIRMED','OVERRIDDEN')
    ) raw
    group by 1
  loop
    select rate.unit_cost into event_unit_cost
      from public.event_paper_cost_rates rate
     where rate.project_id = p_project_id and rate.format_key = paper_row.format_key;
    if found then
      select event_unit_cost as unit_cost, 'EVENT_PAPER_COST_RATE'::text as source, false as review_required into unit_row;
    else
      select * into unit_row from public.resolve_paper_unit_cost(paper_row.format_key) limit 1;
    end if;

    total_usage := total_usage + paper_row.usage;
    review_required := review_required or coalesce(unit_row.review_required, true);
    if not coalesce(unit_row.review_required, true) then
      total_cost := total_cost + paper_row.usage * unit_row.unit_cost;
    end if;

    format_details := format_details || jsonb_build_array(jsonb_build_object(
      'format', paper_row.format_key,
      'usage', paper_row.usage,
      'snapshots', paper_row.snapshot_count,
      'unitCost', unit_row.unit_cost,
      'source', unit_row.source,
      'reviewRequired', unit_row.review_required
    ));
  end loop;

  return jsonb_build_object(
    'unit', 'PHOTOS',
    'usage', total_usage,
    'totalCost', case when review_required then null else round(total_cost, 2) end,
    'reviewRequired', review_required,
    'formats', format_details,
    'source', 'EVENT_PAPER_SNAPSHOTS_AND_COST_MASTER'
  );
end;
$function$;
