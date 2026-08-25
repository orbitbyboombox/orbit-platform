begin;

create or replace function public.update_crm_event_from_customer_profile(
  p_project_id uuid,
  p_changes jsonb,
  p_reason text
)
returns void language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=auth.uid();
  service_start_local text;
  service_end_local text;
  staff_call_local text;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede editar eventos.';
  end if;

  service_start_local:=nullif(trim(coalesce(p_changes->>'serviceStartLocal','')),'');
  service_end_local:=nullif(trim(coalesce(p_changes->>'serviceEndLocal','')),'');
  staff_call_local:=nullif(trim(coalesce(p_changes->>'staffCallLocal','')),'');

  if (service_start_local is null) is distinct from (service_end_local is null) then
    raise exception 'El inicio y término del servicio deben guardarse juntos.';
  end if;

  perform public.update_crm_event(p_project_id,p_changes,p_reason);

  if service_start_local is not null and service_end_local is not null then
    perform public.update_event_service_schedule(
      p_project_id,
      service_start_local,
      service_end_local,
      staff_call_local
    );
  end if;

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
