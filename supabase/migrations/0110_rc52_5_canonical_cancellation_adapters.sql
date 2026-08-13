begin;

-- Backwards-compatible signatures remain during rolling deployments, but no
-- longer own cancellation logic. Every caller reaches the canonical function.
create or replace function public.cancel_staff_assignment_by_founder(
  p_assignment_id uuid,p_reason_category text,p_reason_detail text
) returns uuid language sql security invoker set search_path=public as $$
  select public.cancel_staff_assignment_canonical(p_assignment_id,null,null,null,'FOUNDER',p_reason_category,p_reason_detail,null,null,null);
$$;
grant execute on function public.cancel_staff_assignment_by_founder(uuid,text,text) to authenticated;

create or replace function public.cancel_staff_assignment_from_portal(
  p_staff_id uuid,p_project_id uuid,p_responsibility text,p_reason_category text,p_reason_detail text
) returns uuid language sql security definer set search_path=public as $$
  select public.cancel_staff_assignment_canonical(null,p_staff_id,p_project_id,p_responsibility,'STAFF',p_reason_category,p_reason_detail,null,null,null);
$$;
revoke all on function public.cancel_staff_assignment_from_portal(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.cancel_staff_assignment_from_portal(uuid,uuid,text,text,text) to service_role;

commit;
