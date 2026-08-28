begin;

create or replace function public.review_staff_expense_submission(
  p_submission_id uuid,
  p_action text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  item public.staff_expense_submissions%rowtype;
  created_expense_id uuid;
  settlement_id uuid;
  project_customer uuid;
  event_code text;
  expense_category text;
  assignment_ids uuid[];
begin
  if not public.can_administer() then
    raise exception 'Solo Founder o Administración puede revisar gastos Staff.';
  end if;
  if p_action not in('APPROVE','REJECT') then raise exception 'Acción inválida.'; end if;
  if p_action='REJECT' and nullif(trim(p_reason),'') is null then
    raise exception 'El motivo de rechazo es obligatorio.';
  end if;

  select * into item
  from public.staff_expense_submissions
  where id=p_submission_id
  for update;

  if item.id is null then raise exception 'Solicitud no encontrada.'; end if;
  if item.status='APPROVED' then return item.materialized_expense_id; end if;
  if item.status<>'PENDING_REVIEW' then raise exception 'La solicitud ya fue revisada.'; end if;

  if p_action='REJECT' then
    update public.staff_expense_submissions
    set status='REJECTED',rejection_reason=trim(p_reason),reviewed_at=now(),
        reviewed_by=auth.uid(),updated_at=now()
    where id=item.id;
    return null;
  end if;

  select array_agg(a.id order by a.created_at,a.id) into assignment_ids
    from public.assignments a
    where a.project_id=item.project_id
      and a.staff_id=item.staff_id
      and a.deleted_at is null
      and a.status in('CONFIRMED','ACCEPTED','COMPLETED');

  if coalesce(cardinality(assignment_ids),0)=0 then
    raise exception 'No se pudo validar la asignación Staff del Evento. Revisa la asociación operacional antes de aprobar.';
  end if;

  select s.id into settlement_id
  from public.event_staff_payments s
  where s.project_id=item.project_id
    and s.staff_id=item.staff_id
    and s.status='CONFIRMED'
    and s.deleted_at is null
  order by s.created_at desc
  limit 1;

  if item.reimbursement and settlement_id is null then
    raise exception 'El gasto conserva su Evento y Staff, pero falta una liquidación confirmada para recibir el reembolso.';
  end if;

  expense_category:=case item.category
    when 'UBER_TRANSPORT' then 'TRANSPORT'
    when 'FOOD' then 'OTHER_OPERATIONAL'
    when 'PARKING' then 'PARKING'
    when 'TOLLS' then 'TOLLS'
    when 'MOBILITY' then 'TRANSPORT'
    else 'OTHER_OPERATIONAL'
  end;

  insert into public.expenses(
    project_id,category,confirmed_category,expense_scope,occurred_on,subtotal,vat,total,
    currency,receipt_path,status,responsible_staff_id,event_staff_settlement_id,
    payment_method,extraction_status,idempotency_key,approval_reason,
    created_by,updated_by,approved_by,approved_at
  )
  values(
    item.project_id,expense_category,expense_category,
    case when item.reimbursement then 'STAFF_REIMBURSEMENT' else 'EVENT_DIRECT' end,
    item.occurred_on,item.amount,0,item.amount,'CLP',item.receipt_path,'APPROVED',item.staff_id,
    case when item.reimbursement then settlement_id else null end,item.payment_method,'CONFIRMED',
    'staff-expense-submission:'||item.id,
    jsonb_build_object(
      'associationType','EVENT',
      'associationId',item.project_id,
      'assignmentIds',to_jsonb(assignment_ids),
      'responsibleStaffId',item.staff_id,
      'eventStaffSettlementId',case when item.reimbursement then settlement_id else null end,
      'staffExpenseSubmissionId',item.id,
      'description',item.description,
      'paymentMethod',item.payment_method,
      'reimbursement',item.reimbursement
    )::text,
    auth.uid(),auth.uid(),auth.uid(),now()
  )
  on conflict(idempotency_key) where idempotency_key is not null and deleted_at is null
  do update set idempotency_key=excluded.idempotency_key
  returning id into created_expense_id;

  update public.documents
  set expense_id=created_expense_id
  where staff_expense_submission_id=item.id
    and deleted_at is null
    and (documents.expense_id is null or documents.expense_id=created_expense_id);

  update public.staff_expense_submissions
  set status='APPROVED',materialized_expense_id=created_expense_id,reviewed_at=now(),
      reviewed_by=auth.uid(),updated_at=now()
  where id=item.id;

  select customer_id,orbit_event_id into project_customer,event_code
  from public.projects where id=item.project_id;

  insert into public.timeline_events(
    customer_id,project_id,staff_id,orbit_event_id,event_type,title,description,
    actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason
  )
  values(
    project_customer,item.project_id,item.staff_id,event_code,'STAFF_EXPENSE_APPROVED',
    'Gasto Staff aprobado',concat(item.category,' · $',item.amount),'Administrador',
    'Operations','STAFF_EXPENSE_APPROVED','StaffExpenseSubmission',item.id,
    'Gasto Staff materializado en el costo del Evento.','staff-expense-approved:'||item.id,
    coalesce(nullif(trim(p_reason),''),'Aprobación administrativa')
  )
  on conflict(correlation_id) do nothing;

  perform public.sync_event_operation_cost(item.project_id);
  return created_expense_id;
end;
$$;

revoke all on function public.review_staff_expense_submission(uuid,text,text) from public,anon;
grant execute on function public.review_staff_expense_submission(uuid,text,text) to authenticated,service_role;

commit;
