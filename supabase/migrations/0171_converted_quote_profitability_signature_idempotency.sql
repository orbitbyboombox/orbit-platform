begin;

-- 0170 made the canonical cost breakdown part of the profitability signature.
-- Keep that value-based identity, but exclude the writer timestamp because
-- sync_event_profitability itself refreshes financial_event_records.updated_at.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.sync_event_profitability(uuid)'::regprocedure) into definition;
  if position('s.updated_at,f.updated_at,f.revenue' in definition)=0 then
    raise exception 'Unexpected sync_event_profitability signature definition';
  end if;
  definition:=replace(definition,'s.updated_at,f.updated_at,f.revenue','s.updated_at,f.revenue');
  execute definition;
end $$;

commit;
