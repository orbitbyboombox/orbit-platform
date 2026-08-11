begin;

do $$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(
    'public.execute_go_live_smart_cleanup_service(text,uuid[],integer,uuid)'::regprocedure
  ) into definition;

  patched := replace(
    definition,
    'where project_id = victoria_project.id and deleted_at is null order by created_at desc limit 1',
    'where project_id = victoria_project.id order by created_at desc limit 1'
  );
  patched := replace(
    patched,
    'where project_id = soledad_project.id and deleted_at is null order by created_at desc limit 1',
    'where project_id = soledad_project.id order by created_at desc limit 1'
  );

  if patched = definition then
    raise exception 'No fue posible adaptar la consulta de acuerdos del Smart Cleanup.';
  end if;

  execute patched;
end
$$;

commit;
