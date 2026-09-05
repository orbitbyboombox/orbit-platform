begin;

-- Staff settlement eligibility is based on operational completion, not customer payment
-- or the irreversible administrative closure cycle. Keep existing CLOSED/override
-- paths compatible while making the canonical project Completed state sufficient.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.calculate_staff_monthly_settlement(uuid,date)'::regprocedure) into definition;
  definition:=replace(definition,
    'and (exists(select 1 from public.event_operational_closures closure where closure.project_id=project.id and closure.status=''CLOSED'')',
    'and (upper(coalesce(project.status,'''')) in(''COMPLETED'',''COMPLETADO'') or exists(select 1 from public.event_operational_closures closure where closure.project_id=project.id and closure.status=''CLOSED'')');
  execute definition;
end $$;

-- Explicit Founder action; this changes only operational status and leaves all
-- customer receivable/payment projections untouched.
create or replace function public.mark_event_completed(p_project_id uuid)
returns public.projects language plpgsql security definer set search_path=public as $$
declare item public.projects%rowtype;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' and (auth.uid() is null or not public.can_administer()) then raise exception 'Acceso autorizado requerido.'; end if;
  update public.projects set status='Completed',updated_by=auth.uid(),updated_at=now()
    where id=p_project_id and deleted_at is null and upper(coalesce(status,'')) not in('CANCELLED','CANCELED','ARCHIVED','DELETED')
    returning * into item;
  if not found then raise exception 'Evento no disponible para completar.'; end if;
  return item;
end $$;

grant execute on function public.mark_event_completed(uuid) to authenticated;
commit;
