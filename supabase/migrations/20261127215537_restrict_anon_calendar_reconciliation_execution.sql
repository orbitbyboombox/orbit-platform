revoke execute on function public.accept_approved_calendar_remote_state(
  uuid,text,timestamptz,text,text,text,text,timestamptz,jsonb,integer,uuid
) from public, anon;
revoke execute on function public.flag_calendar_remote_reconciliation_conflict(uuid,text,text,text,jsonb,uuid) from public, anon;
do $$
begin
  if has_function_privilege('anon','public.accept_approved_calendar_remote_state(uuid,text,timestamptz,text,text,text,text,timestamptz,jsonb,integer,uuid)','execute')
    or has_function_privilege('anon','public.flag_calendar_remote_reconciliation_conflict(uuid,text,text,text,jsonb,uuid)','execute')
    or not has_function_privilege('authenticated','public.accept_approved_calendar_remote_state(uuid,text,timestamptz,text,text,text,text,timestamptz,jsonb,integer,uuid)','execute') then
    raise exception 'Unexpected Calendar reconciliation grants';
  end if;
end;
$$;
