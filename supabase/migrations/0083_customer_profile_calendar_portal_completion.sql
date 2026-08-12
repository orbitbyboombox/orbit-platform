begin;

create or replace function public.update_crm_event_from_customer_profile(
  p_project_id uuid,
  p_changes jsonb,
  p_reason text
)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede editar eventos.';
  end if;
  perform public.update_crm_event(p_project_id,p_changes,p_reason);
  if p_changes ? 'eventAddress' then
    update public.projects
    set operations=coalesce(operations,'{}'::jsonb)||jsonb_build_object(
      'eventAddress',trim(coalesce(p_changes->>'eventAddress',''))
    ),updated_by=actor,approval_reason=trim(p_reason)
    where id=p_project_id and deleted_at is null;
  end if;
end $$;

revoke all on function public.update_crm_event_from_customer_profile(uuid,jsonb,text) from public,anon;
grant execute on function public.update_crm_event_from_customer_profile(uuid,jsonb,text) to authenticated;

commit;
