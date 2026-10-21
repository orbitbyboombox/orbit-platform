begin;

-- Prepared only. This migration must be reviewed and applied through the
-- authorized Production migration procedure before enabling the post-commit
-- worker. It never changes historical reservations or financial records.
alter table public.reservation_transactions
  add column if not exists integration_lease_token uuid,
  add column if not exists integration_lease_until timestamptz;

create index if not exists reservation_transactions_integration_lease_idx
  on public.reservation_transactions(integration_lease_until)
  where status <> 'COMPLETED';

create or replace function public.claim_manual_reservation_integrations(
  p_transaction_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 600
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  if auth.uid() is null or p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'Solicitud de reanudación no válida.';
  end if;

  update public.reservation_transactions
  set integration_lease_token = p_lease_token,
      integration_lease_until = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  where id = p_transaction_id
    and status <> 'COMPLETED'
    and (integration_lease_until is null or integration_lease_until <= now() or integration_lease_token = p_lease_token)
    and (actor_id = auth.uid() or public.can_administer())
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_manual_reservation_integrations(uuid, uuid, integer)
  from public, anon;
grant execute on function public.claim_manual_reservation_integrations(uuid, uuid, integer)
  to authenticated;

commit;
