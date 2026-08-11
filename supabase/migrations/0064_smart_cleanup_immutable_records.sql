begin;

create or replace function public.execute_go_live_smart_cleanup_service(
  p_confirmation text,
  p_keep_project_ids uuid[],
  p_external_projects integer,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  protected_table record;
begin
  if auth.role() <> 'service_role' then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_actor
      and role in ('CEO', 'ADMINISTRATOR')
  ) then
    raise exception 'INVALID_FOUNDER_ACTOR';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('app.production_initialization', 'on', true);

  for protected_table in
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name in ('project_id', 'customer_id')
      and c.table_name not in (
        'projects',
        'customers',
        'smart_cleanup_runs',
        'production_initialization_runs'
      )
  loop
    execute format('alter table public.%I disable trigger user', protected_table.table_name);
  end loop;

  begin
    result := public.execute_go_live_smart_cleanup(
      p_confirmation,
      p_keep_project_ids,
      p_external_projects
    );
  exception when others then
    for protected_table in
      select distinct c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
       and t.table_type = 'BASE TABLE'
      where c.table_schema = 'public'
        and c.column_name in ('project_id', 'customer_id')
        and c.table_name not in (
          'projects',
          'customers',
          'smart_cleanup_runs',
          'production_initialization_runs'
        )
    loop
      execute format('alter table public.%I enable trigger user', protected_table.table_name);
    end loop;
    raise;
  end;

  for protected_table in
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name in ('project_id', 'customer_id')
      and c.table_name not in (
        'projects',
        'customers',
        'smart_cleanup_runs',
        'production_initialization_runs'
      )
  loop
    execute format('alter table public.%I enable trigger user', protected_table.table_name);
  end loop;

  return result;
end
$$;

commit;
