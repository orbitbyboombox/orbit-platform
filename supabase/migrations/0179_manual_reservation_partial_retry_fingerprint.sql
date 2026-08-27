begin;

-- A failed post-create reservation may legitimately need a corrected payment
-- term before Accounts Receivable can resume. Keep the transaction identity
-- strict for new reservations, but allow that controlled correction only when
-- the already-created Customer and Event identity still match exactly.
create or replace function public.create_or_resume_manual_reservation(
  p_transaction_id uuid,
  p_draft jsonb
) returns table(
  customer_id uuid,
  project_id uuid,
  orbit_event_id text,
  customer_created boolean,
  project_created boolean,
  resumed boolean,
  transaction_status text,
  completed_steps jsonb
) language plpgsql security invoker set search_path=public as $$
declare
  actor uuid:=auth.uid();
  tx public.reservation_transactions%rowtype;
  stored_project public.projects%rowtype;
  created record;
  fingerprint text:=md5(p_draft::text);
  requested_customer_id uuid;
  d_event jsonb:=p_draft->'event';
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.reservation_transactions(id,actor_id,draft_fingerprint,attempt_count)
  values(p_transaction_id,actor,fingerprint,1)
  on conflict(id) do update set
    attempt_count=reservation_transactions.attempt_count+1,
    updated_at=now();

  select * into tx
  from public.reservation_transactions
  where id=p_transaction_id
  for update;
  if tx.actor_id<>actor and not public.can_administer() then
    raise exception 'La transacción pertenece a otro usuario.';
  end if;

  if tx.draft_fingerprint<>fingerprint then
    begin
      requested_customer_id:=nullif(p_draft->>'crmCustomerId','')::uuid;
    exception when invalid_text_representation then
      raise exception 'La reserva reintentada no coincide con el borrador original.';
    end;
    select * into stored_project
    from public.projects
    where id=tx.project_id and deleted_at is null;
    if tx.project_id is null
      or tx.customer_id is null
      or tx.orbit_event_id is null
      or not coalesce(tx.completed_steps,'[]'::jsonb) ? 'Customer Lookup'
      or not coalesce(tx.completed_steps,'[]'::jsonb) ? 'Customer Create / Reuse'
      or not coalesce(tx.completed_steps,'[]'::jsonb) ? 'Project Create'
      or not coalesce(tx.completed_steps,'[]'::jsonb) ? 'Event Create'
      or not coalesce(tx.completed_steps,'[]'::jsonb) ? 'Timeline'
      or stored_project.id is null
      or requested_customer_id is distinct from tx.customer_id
      or stored_project.customer_id is distinct from tx.customer_id
      or stored_project.orbit_event_id is distinct from tx.orbit_event_id
      or stored_project.project_type is distinct from p_draft->>'type'
      or stored_project.event_date is distinct from (d_event->>'date')::date
      or stored_project.event_time is distinct from (d_event->>'time')::time
      or trim(coalesce(stored_project.location,'')) is distinct from trim(coalesce(d_event->>'location',''))
      or trim(coalesce(stored_project.city,'')) is distinct from trim(coalesce(d_event->>'city',''))
    then
      raise exception 'La reserva reintentada no coincide con el borrador original.';
    end if;
    update public.reservation_transactions
    set draft_fingerprint=fingerprint,updated_at=now()
    where id=p_transaction_id;
    tx.draft_fingerprint:=fingerprint;
  end if;

  if tx.project_id is not null then
    return query
    select tx.customer_id,tx.project_id,tx.orbit_event_id,false,false,true,
      tx.status,tx.completed_steps;
    return;
  end if;

  select * into created from public.create_manual_reservation_atomic(p_draft);
  update public.reservation_transactions set
    customer_id=created.customer_id,
    project_id=created.project_id,
    orbit_event_id=created.orbit_event_id,
    status='CREATED',
    current_step='Accounts Receivable',
    completed_steps='["Customer Lookup","Customer Create / Reuse","Project Create","Event Create","Timeline"]'::jsonb,
    pending_steps='["Accounts Receivable","Reservation Records","Business Engine","Portal","Google Calendar","Google Drive","Customer Email","Founder Email","Dashboard","Confirmation"]'::jsonb,
    updated_at=now()
  where id=p_transaction_id;

  return query
  select created.customer_id,created.project_id,created.orbit_event_id,
    created.customer_created,created.project_created,false,'CREATED'::text,
    '["Customer Lookup","Customer Create / Reuse","Project Create","Event Create","Timeline"]'::jsonb;
end $$;

revoke all on function public.create_or_resume_manual_reservation(uuid,jsonb)
  from public,anon;
grant execute on function public.create_or_resume_manual_reservation(uuid,jsonb)
  to authenticated;

commit;
