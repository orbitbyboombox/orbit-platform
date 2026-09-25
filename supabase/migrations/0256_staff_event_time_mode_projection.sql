-- V2.1 Phase A.2: expose the canonical event-time mode to Staff projections.
begin;

drop view if exists public.staff_available_event_projection;

create view public.staff_available_event_projection
with (security_invoker=true) as
select
  p.id project_id,
  p.orbit_event_id,
  p.project_type,
  p.event_date,
  p.event_time,
  p.event_time_mode,
  p.city,
  coalesce(c.access_instructions,'') access_instructions,
  coalesce(jsonb_agg(jsonb_build_object(
    'code',ps.service_code,
    'durationHours',ps.duration_hours,
    'quantity',ps.quantity
  )) filter(where ps.id is not null),'[]'::jsonb) services
from public.staff_event_publications publication
join public.projects p on p.id=publication.project_id and p.deleted_at is null
left join public.project_operational_contracts c on c.project_id=p.id
left join public.project_services ps on ps.project_id=p.id
where publication.published
group by p.id,c.access_instructions;

revoke all on public.staff_available_event_projection from public,anon,authenticated;
grant select on public.staff_available_event_projection to service_role;

commit;
