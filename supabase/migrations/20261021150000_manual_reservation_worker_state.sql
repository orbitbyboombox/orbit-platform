begin;

alter table public.reservation_transactions
  add column if not exists integration_attempt_count integer not null default 0,
  add column if not exists integration_next_attempt_at timestamptz,
  add column if not exists integration_last_started_at timestamptz,
  add column if not exists integration_last_finished_at timestamptz,
  add column if not exists integration_stage_state jsonb not null default '{}'::jsonb;

create index if not exists reservation_transactions_integration_worker_idx
  on public.reservation_transactions(status, integration_next_attempt_at, updated_at)
  where project_id is not null and status <> 'COMPLETED';

create or replace function public.claim_manual_reservation_integrations(
  p_transaction_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 600
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare claimed boolean;
begin
  if auth.uid() is null or p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'Solicitud de reanudación no válida.';
  end if;

  update public.reservation_transactions
  set integration_lease_token = p_lease_token,
      integration_lease_until = now() + make_interval(secs => p_lease_seconds),
      integration_attempt_count = integration_attempt_count + 1,
      integration_last_started_at = now(),
      integration_next_attempt_at = null,
      updated_at = now()
  where id = p_transaction_id
    and status <> 'COMPLETED'
    and (integration_lease_until is null or integration_lease_until <= now() or integration_lease_token = p_lease_token)
    and (integration_next_attempt_at is null or integration_next_attempt_at <= now())
    and (actor_id = auth.uid() or public.can_administer())
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function public.claim_manual_reservation_integrations(
  p_transaction_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer,
  p_internal_worker boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare claimed boolean;
begin
  if not p_internal_worker or coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Worker interno no autorizado.';
  end if;
  if p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'Lease no válido.';
  end if;

  update public.reservation_transactions
  set integration_lease_token = p_lease_token,
      integration_lease_until = now() + make_interval(secs => p_lease_seconds),
      integration_attempt_count = integration_attempt_count + 1,
      integration_last_started_at = now(),
      integration_next_attempt_at = null,
      updated_at = now()
  where id = p_transaction_id
    and status <> 'COMPLETED'
    and (integration_lease_until is null or integration_lease_until <= now() or integration_lease_token = p_lease_token)
    and (integration_next_attempt_at is null or integration_next_attempt_at <= now())
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function public.record_manual_reservation_integration(
  p_transaction_id uuid,
  p_lease_token uuid,
  p_step text,
  p_status text,
  p_error text,
  p_duration_ms integer,
  p_next_attempt_seconds integer,
  p_internal_worker boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tx public.reservation_transactions%rowtype;
  done jsonb;
  state jsonb;
  entry jsonb;
  next_at timestamptz;
begin
  if upper(p_status) not in ('STARTED', 'PASS', 'FAIL')
     or p_step not in ('Reservation Records','Timeline','Business Engine','Portal','Google Calendar','Google Drive','Founder Email','Dashboard','Confirmation') then
    raise exception 'Etapa de integración no válida.';
  end if;
  if p_internal_worker then
    if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
      raise exception 'Worker interno no autorizado.';
    end if;
  elsif auth.uid() is null then
    raise exception 'Sesión requerida.';
  end if;

  select * into tx
  from public.reservation_transactions
  where id = p_transaction_id
  for update;
  if not found then raise exception 'Transacción de reserva no encontrada.'; end if;
  if tx.integration_lease_token is distinct from p_lease_token
     or tx.integration_lease_until is null
     or tx.integration_lease_until < now() then
    raise exception 'Lease de integración expirado o no válido.';
  end if;
  if not p_internal_worker and tx.actor_id <> auth.uid() and not public.can_administer() then
    raise exception 'Acceso denegado.';
  end if;

  done := coalesce(tx.completed_steps, '[]'::jsonb);
  if upper(p_status) = 'PASS' and not done ? p_step then
    done := done || jsonb_build_array(p_step);
  end if;
  entry := jsonb_build_object(
    'status', upper(p_status),
    'durationMs', greatest(coalesce(p_duration_ms, 0), 0),
    'error', nullif(p_error, ''),
    'updatedAt', now()
  );
  state := jsonb_set(coalesce(tx.integration_stage_state, '{}'::jsonb), array[p_step], entry, true);
  next_at := case
    when upper(p_status) = 'FAIL' then now() + make_interval(secs => least(greatest(coalesce(p_next_attempt_seconds, 30), 30), 3600))
    else tx.integration_next_attempt_at
  end;

  update public.reservation_transactions
  set status = case
        when upper(p_status) = 'FAIL' then 'FAILED'
        when p_step = 'Confirmation' and upper(p_status) = 'PASS' then 'COMPLETED'
        else 'PROCESSING'
      end,
      current_step = p_step,
      completed_steps = done,
      pending_steps = (
        select coalesce(jsonb_agg(value), '[]'::jsonb)
        from jsonb_array_elements('["Customer Lookup","Customer Create / Reuse","Project Create","Event Create","Timeline","Accounts Receivable","Reservation Records","Business Engine","Portal","Google Calendar","Google Drive","Customer Email","Founder Email","Dashboard","Confirmation"]'::jsonb) item(value)
        where not done ? (value#>>'{}')
      ),
      last_error = case when upper(p_status) = 'FAIL' then p_error else null end,
      integration_stage_state = state,
      integration_next_attempt_at = next_at,
      integration_last_finished_at = case when upper(p_status) = 'STARTED' then integration_last_finished_at else now() end,
      completed_at = case when p_step = 'Confirmation' and upper(p_status) = 'PASS' then now() else completed_at end,
      updated_at = now()
  where id = p_transaction_id;

  return jsonb_build_object('transactionId', p_transaction_id, 'step', p_step, 'status', upper(p_status));
end;
$$;

create or replace function public.release_manual_reservation_integration(
  p_transaction_id uuid,
  p_lease_token uuid,
  p_internal_worker boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare released boolean;
begin
  if p_internal_worker then
    if coalesce(auth.jwt()->>'role', '') <> 'service_role' then raise exception 'Worker interno no autorizado.'; end if;
  elsif auth.uid() is null then
    raise exception 'Sesión requerida.';
  end if;
  update public.reservation_transactions
  set integration_lease_token = null,
      integration_lease_until = null,
      integration_last_finished_at = now(),
      updated_at = now()
  where id = p_transaction_id
    and integration_lease_token = p_lease_token
  returning true into released;
  return coalesce(released, false);
end;
$$;

revoke all on function public.claim_manual_reservation_integrations(uuid, uuid, integer) from public, anon;
revoke all on function public.claim_manual_reservation_integrations(uuid, uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.record_manual_reservation_integration(uuid, uuid, text, text, text, integer, integer, boolean) from public, anon;
revoke all on function public.release_manual_reservation_integration(uuid, uuid, boolean) from public, anon;
grant execute on function public.claim_manual_reservation_integrations(uuid, uuid, integer) to authenticated;
grant execute on function public.claim_manual_reservation_integrations(uuid, uuid, integer, boolean) to service_role;
grant execute on function public.record_manual_reservation_integration(uuid, uuid, text, text, text, integer, integer, boolean) to authenticated, service_role;
grant execute on function public.release_manual_reservation_integration(uuid, uuid, boolean) to authenticated, service_role;

commit;
