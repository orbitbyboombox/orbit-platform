begin;

create or replace function public.reconcile_founder_action_alerts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  onboarding_count integer;
  expense_count integer;
  resolved_count integer := 0;
  affected integer;
begin
  if auth.role() <> 'service_role' and not public.can_administer() then
    raise exception 'Solo Founder o Administración puede reconciliar pendientes.';
  end if;

  insert into public.internal_notifications(
    notification_type,title,message,status,correlation_id,category,priority,
    action_required,entity_type,entity_id,related_href,metadata
  )
  select
    'STAFF_ONBOARDING_REVIEW_REQUIRED',
    'NUEVO OPERADOR POR CONFIRMAR',
    concat(i.first_name,' ',i.last_name,' · Registro completo · ',count(d.id),' documentos'),
    'UNREAD',
    'founder-action:staff-onboarding:'||i.id,
    'STAFF','HIGH',true,'StaffOnboardingInvitation',i.id::text,
    '/resources/staff?reviewOnboarding='||i.id,
    jsonb_build_object(
      'source','CANONICAL_PENDING_STATE',
      'submittedAt',i.submitted_at,
      'documentCount',count(d.id),
      'completeness','SUBMITTED'
    )
  from public.staff_onboarding_invitations i
  left join public.staff_onboarding_documents d on d.invitation_id=i.id
  where i.status='SUBMITTED'
  group by i.id,i.first_name,i.last_name,i.submitted_at
  on conflict(correlation_id) do update set
    notification_type=excluded.notification_type,
    title=excluded.title,
    message=excluded.message,
    status='UNREAD',
    category=excluded.category,
    priority=excluded.priority,
    action_required=true,
    entity_type=excluded.entity_type,
    entity_id=excluded.entity_id,
    related_href=excluded.related_href,
    metadata=excluded.metadata;

  insert into public.internal_notifications(
    project_id,customer_id,staff_id,notification_type,title,message,status,
    correlation_id,category,priority,action_required,entity_type,entity_id,
    related_href,metadata
  )
  select
    s.project_id,p.customer_id,s.staff_id,
    'STAFF_EXPENSE_REVIEW_REQUIRED',
    'NUEVO GASTO OPERADOR POR REVISAR',
    concat(st.first_name,' ',st.last_name,' · $',trim(to_char(s.amount,'FM999G999G999G990')),' · ',s.category,' · ',coalesce(p.orbit_event_id,p.name)),
    'UNREAD',
    'founder-action:staff-expense:'||s.id,
    'STAFF','HIGH',true,'StaffExpenseSubmission',s.id::text,
    '/projects/'||s.project_id||'/staff-expenses?reviewExpense='||s.id||'#expense-'||s.id,
    jsonb_build_object(
      'source','CANONICAL_PENDING_STATE',
      'submittedAt',s.submitted_at,
      'amount',s.amount,
      'category',s.category,
      'projectId',s.project_id,
      'eventCode',p.orbit_event_id
    )
  from public.staff_expense_submissions s
  join public.staff st on st.id=s.staff_id
  join public.projects p on p.id=s.project_id
  where s.status='PENDING_REVIEW'
  on conflict(correlation_id) do update set
    project_id=excluded.project_id,
    customer_id=excluded.customer_id,
    staff_id=excluded.staff_id,
    notification_type=excluded.notification_type,
    title=excluded.title,
    message=excluded.message,
    status='UNREAD',
    category=excluded.category,
    priority=excluded.priority,
    action_required=true,
    entity_type=excluded.entity_type,
    entity_id=excluded.entity_id,
    related_href=excluded.related_href,
    metadata=excluded.metadata;

  update public.internal_notifications n
  set status='RESOLVED',action_required=false,read_at=coalesce(n.read_at,now())
  where n.notification_type='STAFF_ONBOARDING_REVIEW_REQUIRED'
    and n.status<>'RESOLVED'
    and not exists(
      select 1 from public.staff_onboarding_invitations i
      where i.id::text=n.entity_id and i.status='SUBMITTED'
    );
  get diagnostics affected=row_count;
  resolved_count:=resolved_count+affected;

  with ranked as (
    select id,row_number() over(
      partition by entity_type,entity_id
      order by case priority when 'CRITICAL' then 0 when 'HIGH' then 1 when 'NORMAL' then 2 else 3 end,created_at desc,id
    ) as position
    from public.internal_notifications
    where action_required=true and status<>'RESOLVED'
      and notification_type in(
        'STAFF_ONBOARDING_REVIEW_REQUIRED','STAFF_EXPENSE_REVIEW_REQUIRED',
        'HEALTH_WARNING','EVENT_NOT_READY','INVOICE_OVERDUE','INVOICE_DUE_TODAY','INVOICE_DUE_SOON'
      )
  )
  update public.internal_notifications n
  set status='RESOLVED',action_required=false,read_at=coalesce(n.read_at,now())
  from ranked r where r.id=n.id and r.position>1;
  get diagnostics affected=row_count;
  resolved_count:=resolved_count+affected;

  update public.internal_notifications n
  set status='RESOLVED',action_required=false,read_at=coalesce(n.read_at,now())
  where n.notification_type='STAFF_EXPENSE_REVIEW_REQUIRED'
    and n.status<>'RESOLVED'
    and not exists(
      select 1 from public.staff_expense_submissions s
      where s.id::text=n.entity_id and s.status='PENDING_REVIEW'
    );
  get diagnostics affected=row_count;
  resolved_count:=resolved_count+affected;

  update public.internal_notifications
  set status='RESOLVED',action_required=false,read_at=coalesce(read_at,now())
  where title='Gasto Staff pendiente' and notification_type<>'STAFF_EXPENSE_REVIEW_REQUIRED' and status<>'RESOLVED';
  get diagnostics affected=row_count;
  resolved_count:=resolved_count+affected;

  update public.internal_notifications n
  set status='RESOLVED',action_required=false,read_at=coalesce(n.read_at,now())
  where n.notification_type in('INVOICE_OVERDUE','INVOICE_DUE_TODAY','INVOICE_DUE_SOON')
    and n.status<>'RESOLVED'
    and not exists(
      select 1 from public.accounts_receivable_projection r
      where r.id::text=n.entity_id and r.effective_status in('PENDING','PARTIALLY_PAID','OVERDUE')
    );
  get diagnostics affected=row_count;
  resolved_count:=resolved_count+affected;

  update public.internal_notifications n
  set status='RESOLVED',action_required=false,read_at=coalesce(n.read_at,now())
  where n.notification_type='HEALTH_WARNING'
    and n.status<>'RESOLVED'
    and not exists(
      select 1 from public.system_health_alerts h
      where h.id::text=n.entity_id and h.status='OPEN'
    );
  get diagnostics affected=row_count;
  resolved_count:=resolved_count+affected;

  select count(*) into onboarding_count from public.staff_onboarding_invitations where status='SUBMITTED';
  select count(*) into expense_count from public.staff_expense_submissions where status='PENDING_REVIEW';
  return jsonb_build_object('pendingOnboarding',onboarding_count,'pendingExpenses',expense_count,'resolvedStale',resolved_count);
end;
$$;

revoke all on function public.reconcile_founder_action_alerts() from public,anon;
grant execute on function public.reconcile_founder_action_alerts() to authenticated,service_role;

create or replace function public.sync_founder_action_alert_projection()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.reconcile_founder_action_alerts();
  return new;
end;
$$;

drop trigger if exists staff_onboarding_founder_action_sync on public.staff_onboarding_invitations;
create trigger staff_onboarding_founder_action_sync
after insert or update of status,submitted_at,submitted_data on public.staff_onboarding_invitations
for each row execute function public.sync_founder_action_alert_projection();

drop trigger if exists staff_expense_founder_action_sync on public.staff_expense_submissions;
create trigger staff_expense_founder_action_sync
after insert or update of status,reviewed_at on public.staff_expense_submissions
for each row execute function public.sync_founder_action_alert_projection();

-- Keep the certified submission pipeline and replace only its malformed notification write.
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
  if result is not null then perform public.reconcile_founder_action_alerts(); return result; end if;
  insert into public.staff_expense_submissions(staff_id,project_id,category,amount,occurred_on,payment_method,description,notes,receipt_path,reimbursement,idempotency_key)
  values(p_staff_id,p_project_id,p_category,p_amount,p_occurred_on,nullif(trim(p_payment_method),''),nullif(trim(p_description),''),nullif(trim(p_notes),''),p_receipt_path,coalesce(p_reimbursement,true),p_idempotency_key) returning id into result;
  insert into public.documents(project_id,customer_id,document_type,storage_bucket,storage_path,checksum,staff_expense_submission_id)
  values(p_project_id,project_customer,'STAFF_EXPENSE_RECEIPT','orbit-expenses',p_receipt_path,p_checksum,result) returning id into document;
  update public.staff_expense_submissions set document_id=document where id=result;
  return result;
end $$;

revoke all on function public.create_staff_expense_submission(uuid,uuid,text,numeric,date,text,text,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.create_staff_expense_submission(uuid,uuid,text,numeric,date,text,text,text,text,text,text,boolean) to service_role;

select public.reconcile_founder_action_alerts();

commit;
