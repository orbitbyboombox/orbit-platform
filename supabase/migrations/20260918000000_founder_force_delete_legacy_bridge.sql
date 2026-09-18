begin;

-- All permanent Event deletion entry points converge on the canonical
-- Founder Force Delete saga. The former three-argument overload is retained
-- only as a compatibility bridge so legacy callers cannot reintroduce the
-- lifecycle guards or a second deletion implementation.
drop function if exists public.purge_event_controlled(uuid, text, text);

create or replace function public.purge_event_controlled(
  p_project_id uuid,
  p_confirmation text,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
begin
  return public.purge_event_controlled(
    p_project_id,
    p_confirmation,
    p_reason,
    false -- p_delete_orphan_customer: explicit Customer deletion is a separate Founder action
  );
end;
$$;

revoke all on function public.purge_event_controlled(uuid, text, text) from public, anon;
grant execute on function public.purge_event_controlled(uuid, text, text) to authenticated;

commit;
