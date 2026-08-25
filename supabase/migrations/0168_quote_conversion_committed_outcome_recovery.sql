begin;

-- Reconcile only reservations whose shared pipeline already committed one live
-- Project and completed its canonical transaction. The accepted commercial
-- snapshot is copied as-is; no Customer, Event, payment, or communication row
-- is recreated or removed.
insert into public.project_commercial_origins(
  quotation_id,
  project_id,
  customer_id,
  quotation_number,
  quotation_version,
  accepted_at,
  accepted_by,
  accepted_snapshot,
  conversion_review,
  created_by
)
select
  q.id,
  p.id,
  p.customer_id,
  q.quotation_number,
  q.version,
  coalesce(q.approved_at, q.created_at),
  q.approved_by,
  q.accepted_snapshot,
  jsonb_build_object(
    'recoveredCommittedOutcome', true,
    'recoveredAt', now(),
    'commercialOrigin', coalesce(p.operations->'commercialOrigin', '{}'::jsonb)
  ),
  q.approved_by
from public.quotations q
join public.reservation_transactions tx
  on tx.id = q.conversion_transaction_id
 and tx.project_id = q.project_id
 and tx.status = 'COMPLETED'
join public.projects p
  on p.id = q.project_id
 and p.customer_id = tx.customer_id
 and p.deleted_at is null
where q.status = 'ACCEPTED'
  and q.deleted_at is null
  and q.project_id is not null
  and q.accepted_snapshot is not null
  and q.approved_by is not null
on conflict (quotation_id) do nothing;

update public.quotations q
set
  status = 'CONVERTED',
  customer_id = p.customer_id,
  orbit_event_id = p.orbit_event_id,
  converted_at = coalesce(q.converted_at, tx.completed_at, now()),
  updated_by = coalesce(q.updated_by, q.approved_by),
  updated_at = now()
from public.project_commercial_origins origin
join public.projects p
  on p.id = origin.project_id
 and p.deleted_at is null
join public.reservation_transactions tx
  on tx.project_id = origin.project_id
 and tx.status = 'COMPLETED'
where origin.quotation_id = q.id
  and tx.id = q.conversion_transaction_id
  and q.status = 'ACCEPTED'
  and q.project_id = origin.project_id
  and q.deleted_at is null;

commit;
