-- Global reconciliation: completed Events can never remain in the monthly blockers.
-- Both collections are derived from the same canonical projects.status semantics.
begin;

create or replace function public.staff_monthly_blocking_events(p_staff_id uuid,p_month date)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'settlementId',payment.id,'projectId',project.id,'eventId',project.orbit_event_id,
    'eventDate',project.event_date,'event',project.name,
    'service',coalesce((select string_agg(service.service_code,' + ' order by service.service_code) from public.project_services service where service.project_id=project.id),project.project_type),
    'status',coalesce(project.status,'OPEN')) order by project.event_date,project.event_time,payment.id),'[]'::jsonb)
  from public.event_staff_payments payment join public.projects project on project.id=payment.project_id
  where payment.staff_id=p_staff_id and payment.status='CONFIRMED' and payment.deleted_at is null
    and project.event_date>=date_trunc('month',p_month)::date and project.event_date<(date_trunc('month',p_month)+interval '1 month')::date
    and project.deleted_at is null
    and upper(coalesce(project.status,'')) not in('CANCELLED','CANCELED','ARCHIVED','DELETED','QA','COMPLETED','COMPLETADO')
    and not exists(select 1 from public.event_operational_closures closure where closure.project_id=project.id and closure.status='CLOSED')
    and not exists(select 1 from public.staff_monthly_close_eligibility_overrides override_record where override_record.settlement_id=payment.id)
$$;

comment on function public.staff_monthly_blocking_events(uuid,date) is
  'Canonical mutually-exclusive pending Event set for Staff monthly settlement; Completed projects are excluded.';

commit;
