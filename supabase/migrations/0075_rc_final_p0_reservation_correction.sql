begin;

-- RC-FINAL-P0: PostgreSQL installs pgcrypto outside `public` in Production.
-- The previous initializer evaluated digest() before the transaction row was
-- inserted, so every first attempt failed at Customer Lookup. md5(text) is a
-- built-in deterministic fingerprint and does not depend on extension schemas.
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
  created record;
  fingerprint text:=md5(p_draft::text);
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.reservation_transactions(id,actor_id,draft_fingerprint,attempt_count)
  values(p_transaction_id,actor,fingerprint,1)
  on conflict(id) do update set
    attempt_count=reservation_transactions.attempt_count+1,
    updated_at=now();

  select * into tx from public.reservation_transactions where id=p_transaction_id for update;
  if tx.actor_id<>actor and not public.can_administer() then raise exception 'La transacción pertenece a otro usuario.'; end if;
  if tx.draft_fingerprint<>fingerprint then raise exception 'La reserva reintentada no coincide con el borrador original.'; end if;

  if tx.project_id is not null then
    return query select tx.customer_id,tx.project_id,tx.orbit_event_id,false,false,true,tx.status,tx.completed_steps;
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

  return query select created.customer_id,created.project_id,created.orbit_event_id,created.customer_created,created.project_created,false,'CREATED'::text,'["Customer Lookup","Customer Create / Reuse","Project Create","Event Create","Timeline"]'::jsonb;
end $$;

revoke all on function public.create_or_resume_manual_reservation(uuid,jsonb) from public,anon;
grant execute on function public.create_or_resume_manual_reservation(uuid,jsonb) to authenticated;

commit;
