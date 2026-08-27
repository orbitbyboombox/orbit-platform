begin;

-- Repair the audit projection for every successfully delivered customer
-- confirmation that predates the canonical Event identity write. This never
-- sends email and never changes Customer, Event, receivable or Payment Ledger.
insert into public.timeline_events(
  customer_id,
  project_id,
  orbit_event_id,
  communication_id,
  event_type,
  title,
  description,
  actor_id,
  actor_label,
  source,
  action,
  entity_type,
  entity_id,
  human_message,
  correlation_id,
  created_by
)
select
  c.customer_id,
  c.project_id,
  p.orbit_event_id,
  c.id,
  'RESERVATION_CONFIRMATION_SENT',
  'Confirmación de reserva enviada al cliente',
  'Founder envió la confirmación a ' || coalesce(c.to_recipient, 'cliente'),
  coalesce(c.sent_by, c.created_by),
  'Founder',
  'Gmail',
  'RESERVATION_CONFIRMATION_SENT',
  'Communication',
  c.id,
  'Confirmación de reserva enviada al cliente.',
  'reservation-confirmation:' || c.id::text,
  coalesce(c.sent_by, c.created_by)
from public.communications c
join public.projects p on p.id = c.project_id
where c.communication_type = 'RESERVATION_CONFIRMATION'
  and c.status = 'SENT'
  and p.orbit_event_id is not null
  and not exists (
    select 1
    from public.timeline_events t
    where t.communication_id = c.id
      and t.event_type = 'RESERVATION_CONFIRMATION_SENT'
  );

commit;
