begin;

create table if not exists public.reservation_transactions (
  id uuid primary key,
  actor_id uuid not null references auth.users(id),
  customer_id uuid references public.customers(id) on delete set null,
  project_id uuid unique references public.projects(id) on delete set null,
  orbit_event_id text unique,
  reservation_method text not null default 'MANUAL' check (reservation_method in ('MANUAL','AUTOMATIC')),
  status text not null default 'STARTED' check (status in ('STARTED','CREATED','PROCESSING','FAILED','COMPLETED')),
  current_step text not null default 'Customer Lookup',
  completed_steps jsonb not null default '[]'::jsonb,
  pending_steps jsonb not null default '["Customer Lookup","Customer Create / Reuse","Project Create","Event Create","Timeline","Accounts Receivable","Business Engine","Portal","Google Calendar","Google Drive","Confirmation"]'::jsonb,
  draft_fingerprint text not null,
  last_error text,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists reservation_transactions_actor_idx
  on public.reservation_transactions(actor_id, updated_at desc);

alter table public.reservation_transactions enable row level security;
drop policy if exists reservation_transactions_internal on public.reservation_transactions;
create policy reservation_transactions_internal on public.reservation_transactions
  for all using (actor_id=auth.uid() or public.can_administer())
  with check (actor_id=auth.uid() or public.can_administer());

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
  fingerprint text:=encode(digest(convert_to(p_draft::text,'UTF8'),'sha256'),'hex');
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
    pending_steps='["Accounts Receivable","Business Engine","Portal","Google Calendar","Google Drive","Confirmation"]'::jsonb,
    updated_at=now()
  where id=p_transaction_id;

  return query select created.customer_id,created.project_id,created.orbit_event_id,created.customer_created,created.project_created,false,'CREATED'::text,'["Customer Lookup","Customer Create / Reuse","Project Create","Event Create","Timeline"]'::jsonb;
end $$;

create or replace function public.checkpoint_reservation_transaction(
  p_transaction_id uuid,
  p_step text,
  p_status text,
  p_error text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare tx public.reservation_transactions%rowtype; all_steps constant jsonb:='["Customer Lookup","Customer Create / Reuse","Project Create","Event Create","Timeline","Accounts Receivable","Business Engine","Portal","Google Calendar","Google Drive","Confirmation"]'::jsonb; done jsonb;
begin
  select * into tx from public.reservation_transactions where id=p_transaction_id for update;
  if not found then raise exception 'Transacción de reserva no encontrada.'; end if;
  if tx.actor_id<>auth.uid() and not public.can_administer() then raise exception 'Acceso denegado.'; end if;
  done:=coalesce(tx.completed_steps,'[]'::jsonb);
  if upper(p_status)='PASS' and not done ? p_step then done:=done||jsonb_build_array(p_step); end if;
  update public.reservation_transactions set
    status=case when upper(p_status)='FAIL' then 'FAILED' when p_step='Confirmation' and upper(p_status)='PASS' then 'COMPLETED' else 'PROCESSING' end,
    current_step=p_step,
    completed_steps=done,
    pending_steps=(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(all_steps) item(value) where not done ? (value#>>'{}')),
    last_error=case when upper(p_status)='FAIL' then p_error else null end,
    completed_at=case when p_step='Confirmation' and upper(p_status)='PASS' then now() else completed_at end,
    updated_at=now()
  where id=p_transaction_id;
  return jsonb_build_object('transactionId',p_transaction_id,'status',case when upper(p_status)='FAIL' then 'FAILED' when p_step='Confirmation' and upper(p_status)='PASS' then 'COMPLETED' else 'PROCESSING' end,'completedSteps',done);
end $$;

revoke all on function public.create_or_resume_manual_reservation(uuid,jsonb) from public,anon;
grant execute on function public.create_or_resume_manual_reservation(uuid,jsonb) to authenticated;
revoke all on function public.checkpoint_reservation_transaction(uuid,text,text,text) from public,anon;
grant execute on function public.checkpoint_reservation_transaction(uuid,text,text,text) to authenticated;

commit;
