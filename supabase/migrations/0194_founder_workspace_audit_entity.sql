begin;

create or replace function public.audit_founder_workspace_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row jsonb;
  new_row jsonb;
  entity text;
begin
  old_row := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  entity := coalesce(new_row->>'user_id', old_row->>'user_id');

  insert into public.audit_events(
    entity_type,
    entity_id,
    action,
    actor_id,
    reason,
    previous_state,
    new_state,
    orbit_event_id
  ) values (
    tg_table_name,
    entity,
    tg_op,
    auth.uid(),
    null,
    old_row,
    new_row,
    null
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists founder_workspace_audit
  on public.founder_workspace_preferences;
create trigger founder_workspace_audit
after insert or update or delete on public.founder_workspace_preferences
for each row execute function public.audit_founder_workspace_change();

commit;
