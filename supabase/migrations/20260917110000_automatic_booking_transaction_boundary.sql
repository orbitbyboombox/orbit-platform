begin;

alter table public.automatic_booking_invitations
  add column if not exists idempotency_key text,
  add column if not exists state text not null default 'DRAFT',
  add column if not exists failure_code text,
  add column if not exists failure_stage text,
  add column if not exists last_request_id text;

update public.automatic_booking_invitations
set idempotency_key = 'automatic-booking:' || id::text
where idempotency_key is null;

create unique index if not exists automatic_booking_invitations_idempotency_uidx
  on public.automatic_booking_invitations(idempotency_key);

alter table public.automatic_booking_invitations
  drop constraint if exists automatic_booking_invitations_state_check;
alter table public.automatic_booking_invitations
  add constraint automatic_booking_invitations_state_check
  check (state in ('DRAFT','VALIDATING','CONFIRMING','CONFIRMED','FAILED_RETRYABLE'));

create or replace function public.preflight_reservation_capacity(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  p public.projects%rowtype;
  w record;
  service_codes text[];
  address text;
  result jsonb;
begin
  select * into p from public.projects where id=p_project_id and deleted_at is null;
  if not found then
    return jsonb_build_object('status','REVIEW_REQUIRED','reasonCode','PROJECT_NOT_FOUND','humanSafeReason','No encontramos la reserva que se debe validar.');
  end if;
  select * into w from public.event_operational_window(p_project_id) limit 1;
  select coalesce(array_agg(ps.service_code), '{}'::text[]) into service_codes
  from public.project_services ps where ps.project_id=p_project_id;
  address:=coalesce(nullif(trim(p.operations->>'eventAddress'),''),nullif(trim(p.location),''),'');
  result:=public._preflight_draft_capacity_core(
    service_codes,
    p.project_type,
    p.event_date,
    w.window_start,
    w.window_end,
    address,
    coalesce(p.city,''),
    null
  );
  return result;
end $$;

comment on function public.preflight_reservation_capacity(uuid) is
  'Canonical final capacity check shared by automatic, manual and operational reservation confirmation.';

commit;
