-- Reconcile active default calls using each event's canonical service start.
update public.assignments a
set staff_call_at = public.calculate_staff_call_at(
      ((p.event_date::text || 'T' || left(coalesce(p.event_time::text, '00:00:00'), 8))::timestamp at time zone 'America/Santiago')
    ),
    staff_call_source = 'DEFAULT_60_MINUTES',
    updated_at = now()
from public.projects p
where p.id = a.project_id
  and a.staff_call_source <> 'FOUNDER_OVERRIDE'
  and a.deleted_at is null
  and a.status not in ('CANCELLED','REJECTED')
  and p.event_date is not null
  and p.event_time is not null;
