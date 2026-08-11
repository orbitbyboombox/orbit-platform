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
  result := public.execute_go_live_smart_cleanup(
    p_confirmation,
    p_keep_project_ids,
    p_external_projects
  );
  return result;
end
$$;

revoke all on function public.execute_go_live_smart_cleanup_service(text, uuid[], integer, uuid)
from public, anon, authenticated;
grant execute on function public.execute_go_live_smart_cleanup_service(text, uuid[], integer, uuid)
to service_role;

commit;
