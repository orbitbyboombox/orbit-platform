begin;

alter table public.quotations drop constraint if exists quotations_status_check;
alter table public.quotations add constraint quotations_status_check
  check (status in ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CONVERTED'));

create index if not exists quotations_expiration_active_idx
  on public.quotations(expiration_date,status)
  where deleted_at is null and status in ('DRAFT','SENT');

comment on column public.quotations.pricing_snapshot is
  'Immutable commercial price basis captured when the quotation is created. Catalog changes never rewrite this snapshot.';

create or replace function public.commercial_reservation_status(p_project_status text)
returns text language sql immutable as $$
  select case
    when upper(coalesce(p_project_status,'')) in ('CANCELLED','CANCELED') then 'CANCELLED'
    when upper(coalesce(p_project_status,''))='ARCHIVED' then 'ARCHIVED'
    when upper(coalesce(p_project_status,'')) in ('CONFIRMED','PRODUCTION','EVENT','DELIVERY','CLOSED','COMPLETED') then 'CONFIRMED'
    when upper(coalesce(p_project_status,''))='WAITING_DEPOSIT' then 'AWAITING_DEPOSIT'
    when upper(coalesce(p_project_status,''))='CONTRACT_PENDING' then 'AWAITING_CONTRACT'
    else 'DRAFT'
  end
$$;

create or replace function public.sync_project_commercial_state(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  agreement_signed boolean:=false;
  total numeric:=0;
  paid numeric:=0;
  required_deposit numeric:=0;
  next_status text;
begin
  select exists(
    select 1 from agreements where project_id=p_project_id and status='SIGNED'
  ) into agreement_signed;
  select coalesce(amount,0),coalesce(paid_amount,0) into total,paid
  from invoices where project_id=p_project_id and deleted_at is null
  order by created_at desc limit 1;
  required_deposit:=round(total*0.5);
  next_status:=case when not agreement_signed then 'CONTRACT_PENDING'
    when total<=0 or paid<required_deposit then 'WAITING_DEPOSIT' else 'CONFIRMED' end;
  update projects set status=next_status,updated_at=now()
  where id=p_project_id and deleted_at is null
    and upper(status) not in ('CANCELLED','CANCELED','ARCHIVED','PRODUCTION','EVENT','DELIVERY','CLOSED','COMPLETED');
  update crm_reservations set status=public.commercial_reservation_status(next_status),updated_at=now()
  where project_id=p_project_id and status not in ('CANCELLED','ARCHIVED');
  return jsonb_build_object('projectId',p_project_id,'agreementSigned',agreement_signed,
    'total',total,'paid',paid,'requiredDeposit',required_deposit,'status',next_status);
end $$;

create or replace function public.sync_crm_event_from_project() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update crm_events set customer_id=new.customer_id,orbit_event_id=new.orbit_event_id,event_type=new.project_type,event_date=new.event_date,
    status=case when new.deleted_at is not null or upper(new.status) in('CANCELLED','CANCELED') then 'CANCELLED' when upper(new.status)='ARCHIVED' then 'ARCHIVED' else 'ACTIVE' end,
    updated_by=coalesce(auth.uid(),new.updated_by),updated_at=now() where project_id=new.id;
  update crm_reservations set customer_id=new.customer_id,status=public.commercial_reservation_status(new.status),
    updated_by=coalesce(auth.uid(),new.updated_by),updated_at=now() where project_id=new.id;
  return new;
end $$;

create or replace function public.refresh_commercial_state_from_agreement() returns trigger
language plpgsql security definer set search_path=public as $$
begin perform public.sync_project_commercial_state(new.project_id); return new; end $$;
drop trigger if exists agreements_refresh_commercial_state on public.agreements;
create trigger agreements_refresh_commercial_state after insert or update of status on public.agreements
for each row execute function public.refresh_commercial_state_from_agreement();

create or replace function public.refresh_commercial_state_from_invoice() returns trigger
language plpgsql security definer set search_path=public as $$
begin perform public.sync_project_commercial_state(new.project_id); return new; end $$;
drop trigger if exists invoices_refresh_commercial_state on public.invoices;
create trigger invoices_refresh_commercial_state after insert or update of paid_amount,status on public.invoices
for each row execute function public.refresh_commercial_state_from_invoice();

revoke all on function public.sync_project_commercial_state(uuid) from public,anon;
grant execute on function public.sync_project_commercial_state(uuid) to authenticated,service_role;

commit;
