begin;
-- Financial snapshots are admin-only; general notifications never expose salaries.
create table public.staff_period_email_outbox (
  period_id uuid primary key references public.staff_payment_periods(id),
  notification_id uuid not null unique references public.internal_notifications(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.staff_period_email_outbox enable row level security;
revoke all on public.staff_period_email_outbox from public,anon,authenticated;
grant select on public.staff_period_email_outbox to authenticated,service_role;
create policy staff_period_email_outbox_admin_read on public.staff_period_email_outbox for select to authenticated using ((select public.can_administer()));
-- A durable, unique send intent is part of the close transaction. No historical backfill.
create function public.enqueue_staff_period_close_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare account public.staff_monthly_accounts; member public.staff; company jsonb; monthly jsonb; first_period jsonb; correlation text; notice_id uuid; payload jsonb;
begin
  select * into strict account from public.staff_monthly_accounts where id=new.account_id;
  select * into strict member from public.staff where id=account.staff_id and deleted_at is null;
  if coalesce(member.email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Registra un correo válido del trabajador antes de cerrar.'; end if;
  select jsonb_build_object('legalName',legal_name,'taxId',tax_id,'address',address,'city',city) into company from public.company_settings where settings_key='PRIMARY';
  if company is null then raise exception 'Falta configuración tributaria de BOOMBOX.'; end if;
  monthly:=public.calculate_staff_monthly_settlement(account.staff_id,account.accounting_month);
  select to_jsonb(p) into first_period from public.staff_payment_periods p where p.account_id=account.id and p.period_code='Q1';
  correlation:=case when new.period_code='Q1' then 'staff-period-close:'||new.id else 'staff-boleta-request:'||account.id||':1' end;
  payload:=jsonb_build_object('account',to_jsonb(account),'period',to_jsonb(new),'monthly',monthly,'first',first_period,'company',company,
        'staff',jsonb_build_object('id',member.id,'name',member.first_name||' '||member.last_name,'firstName',member.first_name,'email',member.email,'rut',member.rut,'role',member.role));
  insert into public.internal_notifications(staff_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href,metadata)
  values(account.staff_id,'STAFF_PERIOD_SETTLEMENT_READY','Liquidación BOOMBOX lista',
    case when new.period_code='Q1' then 'Primera quincena cerrada. No se solicita boleta en este cierre.' else 'Cierre mensual: emite una sola boleta por el total de honorarios.' end,
    'UNREAD',correlation,'STAFF','NORMAL',false,'StaffMonthlyAccount',account.id,'/staff-portal',
    jsonb_build_object('email_status','PENDING','accounting_month',account.accounting_month,'period_id',new.id,'queued_at',now()))
  on conflict(correlation_id) do nothing returning id into notice_id;
  if notice_id is not null then
    insert into public.staff_period_email_outbox(period_id,notification_id,payload) values(new.id,notice_id,payload) on conflict(period_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.enqueue_staff_period_close_email() from public,anon,authenticated;
create trigger staff_period_close_email after update of status on public.staff_payment_periods
for each row when(old.status='DRAFT' and new.status='FINALIZED') execute function public.enqueue_staff_period_close_email();
commit;
