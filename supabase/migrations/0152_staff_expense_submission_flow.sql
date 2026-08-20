begin;

create table if not exists public.staff_expense_submissions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id),
  project_id uuid not null references public.projects(id),
  category text not null check(category in('UBER_TRANSPORT','FOOD','PARKING','TOLLS','MOBILITY','OTHER')),
  amount numeric(14,2) not null check(amount>0),
  occurred_on date not null,
  payment_method text,
  description text,
  notes text,
  receipt_path text not null,
  document_id uuid references public.documents(id),
  status text not null default 'PENDING_REVIEW' check(status in('PENDING_REVIEW','APPROVED','REJECTED','CANCELLED')),
  reimbursement boolean not null default true,
  materialized_expense_id uuid unique references public.expenses(id),
  idempotency_key text not null unique,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  rejection_reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.documents add column if not exists staff_expense_submission_id uuid references public.staff_expense_submissions(id);
create unique index if not exists documents_staff_expense_submission_uq on public.documents(staff_expense_submission_id) where staff_expense_submission_id is not null and deleted_at is null;
create index if not exists staff_expense_submission_review_idx on public.staff_expense_submissions(status,submitted_at) where status='PENDING_REVIEW';
alter table public.staff_expense_submissions enable row level security;
create policy staff_expense_submission_admin_read on public.staff_expense_submissions for select using(public.can_administer());
create policy staff_expense_submission_admin_write on public.staff_expense_submissions for all using(public.can_administer()) with check(public.can_administer());
revoke all on public.staff_expense_submissions from public,anon,authenticated;
grant select on public.staff_expense_submissions to authenticated;

create or replace function public.create_staff_expense_submission(p_staff_id uuid,p_project_id uuid,p_category text,p_amount numeric,p_occurred_on date,p_payment_method text,p_description text,p_notes text,p_receipt_path text,p_checksum text,p_idempotency_key text,p_reimbursement boolean default true)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid; project_customer uuid; event_code text; document uuid;
begin
  if p_category not in('UBER_TRANSPORT','FOOD','PARKING','TOLLS','MOBILITY','OTHER') or p_amount<=0 then raise exception 'Gasto inválido.'; end if;
  if p_category='OTHER' and nullif(trim(p_description),'') is null then raise exception 'Describe el otro gasto.'; end if;
  select p.customer_id,p.orbit_event_id into project_customer,event_code from public.projects p
  where p.id=p_project_id and p.deleted_at is null and p.status not in('CANCELLED','DELETED')
    and p.event_date between current_date-interval '30 days' and current_date+interval '15 days'
    and exists(select 1 from public.assignments a where a.project_id=p.id and a.staff_id=p_staff_id and a.deleted_at is null and a.status in('CONFIRMED','ACCEPTED','COMPLETED'));
  if project_customer is null then raise exception 'Solo puedes registrar gastos en Eventos asignados vigentes.'; end if;
  select id into result from public.staff_expense_submissions where idempotency_key=p_idempotency_key;
  if result is not null then return result; end if;
  insert into public.staff_expense_submissions(staff_id,project_id,category,amount,occurred_on,payment_method,description,notes,receipt_path,reimbursement,idempotency_key)
  values(p_staff_id,p_project_id,p_category,p_amount,p_occurred_on,nullif(trim(p_payment_method),''),nullif(trim(p_description),''),nullif(trim(p_notes),''),p_receipt_path,coalesce(p_reimbursement,true),p_idempotency_key) returning id into result;
  insert into public.documents(project_id,customer_id,document_type,storage_bucket,storage_path,checksum,staff_expense_submission_id)
  values(p_project_id,project_customer,'STAFF_EXPENSE_RECEIPT','orbit-expenses',p_receipt_path,p_checksum,result) returning id into document;
  update public.staff_expense_submissions set document_id=document where id=result;
  insert into public.internal_notifications(staff_id,category,title,message,metadata)
  values(null,'OPERATIONS','Gasto Staff pendiente',concat('Nuevo gasto Staff por $',p_amount,' para ',event_code,'.'),jsonb_build_object('projectId',p_project_id,'submissionId',result));
  return result;
end $$;

create or replace function public.review_staff_expense_submission(p_submission_id uuid,p_action text,p_reason text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare item public.staff_expense_submissions%rowtype; expense_id uuid; settlement_id uuid; project_customer uuid; event_code text;
begin
  if not public.can_administer() then raise exception 'Solo Founder o Administración puede revisar gastos Staff.'; end if;
  if p_action not in('APPROVE','REJECT') then raise exception 'Acción inválida.'; end if;
  if p_action='REJECT' and nullif(trim(p_reason),'') is null then raise exception 'El motivo de rechazo es obligatorio.'; end if;
  select * into item from public.staff_expense_submissions where id=p_submission_id for update;
  if item.id is null then raise exception 'Solicitud no encontrada.'; end if;
  if item.status='APPROVED' then return item.materialized_expense_id; end if;
  if item.status<>'PENDING_REVIEW' then raise exception 'La solicitud ya fue revisada.'; end if;
  if p_action='REJECT' then
    update public.staff_expense_submissions set status='REJECTED',rejection_reason=trim(p_reason),reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=item.id;
    return null;
  end if;
  select id into settlement_id from public.event_staff_payments where project_id=item.project_id and staff_id=item.staff_id and status='CONFIRMED' and deleted_at is null order by created_at desc limit 1;
  insert into public.expenses(project_id,category,occurred_on,subtotal,vat,total,currency,receipt_path,status,responsible_staff_id,event_staff_settlement_id,idempotency_key,approval_reason,created_by,updated_by,approved_by,approved_at)
  values(item.project_id,case item.category when 'UBER_TRANSPORT' then 'TRANSPORT' when 'FOOD' then 'OTHER_OPERATIONAL' when 'PARKING' then 'PARKING' when 'TOLLS' then 'TOLLS' when 'MOBILITY' then 'TRANSPORT' else 'OTHER_OPERATIONAL' end,item.occurred_on,item.amount,0,item.amount,'CLP',item.receipt_path,'APPROVED',item.staff_id,case when item.reimbursement then settlement_id else null end,'staff-expense-submission:'||item.id,jsonb_build_object('staffExpenseSubmissionId',item.id,'description',item.description,'paymentMethod',item.payment_method,'reimbursement',item.reimbursement)::text,auth.uid(),auth.uid(),auth.uid(),now())
  on conflict(idempotency_key) where idempotency_key is not null and deleted_at is null do update set idempotency_key=excluded.idempotency_key returning id into expense_id;
  update public.staff_expense_submissions set status='APPROVED',materialized_expense_id=expense_id,reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=item.id;
  select customer_id,orbit_event_id into project_customer,event_code from public.projects where id=item.project_id;
  insert into public.timeline_events(customer_id,project_id,staff_id,orbit_event_id,event_type,title,description,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason)
  values(project_customer,item.project_id,item.staff_id,event_code,'STAFF_EXPENSE_APPROVED','Gasto Staff aprobado',concat(item.category,' · $',item.amount),'Administrador','Operations','STAFF_EXPENSE_APPROVED','StaffExpenseSubmission',item.id,'Gasto Staff materializado en el costo del Evento.','staff-expense-approved:'||item.id,coalesce(nullif(trim(p_reason),''),'Aprobación administrativa')) on conflict(correlation_id) do nothing;
  perform public.sync_event_operation_cost(item.project_id);
  return expense_id;
end $$;

revoke all on function public.create_staff_expense_submission(uuid,uuid,text,numeric,date,text,text,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.create_staff_expense_submission(uuid,uuid,text,numeric,date,text,text,text,text,text,text,boolean) to service_role;
revoke all on function public.review_staff_expense_submission(uuid,text,text) from public,anon;
grant execute on function public.review_staff_expense_submission(uuid,text,text) to authenticated,service_role;

commit;
