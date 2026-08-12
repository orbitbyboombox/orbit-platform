begin;

create or replace function public.prepare_invoice() returns trigger language plpgsql set search_path=public as $$
begin
  if new.payment_term='CUSTOM' and new.custom_term_days is null then raise exception 'Los días personalizados son obligatorios.'; end if;
  if new.status<>'DRAFT' and new.issue_date is null then new.issue_date=current_date; end if;
  if new.issue_date is not null and (tg_op='INSERT' or new.issue_date is distinct from old.issue_date or new.payment_term is distinct from old.payment_term or new.custom_term_days is distinct from old.custom_term_days or new.due_date is not distinct from old.due_date) then
    new.due_date=new.issue_date+public.invoice_term_days(new.payment_term,new.custom_term_days);
  end if;
  if new.paid_amount=new.amount and new.amount>0 then new.status='PAID'; new.closed_at=coalesce(new.closed_at,now());
  elsif new.paid_amount>0 and new.status<>'CANCELLED' then new.status='PARTIALLY_PAID';
  elsif new.status not in ('DRAFT','CANCELLED') then new.status=case when new.due_date<current_date then 'OVERDUE' else 'PENDING' end; end if;
  return new;
end $$;

create or replace function public.update_receivable_dates(p_invoice_id uuid,p_payment_id uuid,p_payment_date date,p_due_date date,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); inv invoices%rowtype; movement uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede editar fechas financieras.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'El motivo es obligatorio.'; end if;
  select * into inv from invoices where id=p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Cuenta por cobrar no encontrada.'; end if;
  if p_payment_id is not null then
    if p_payment_date is null then raise exception 'La fecha de pago es obligatoria.'; end if;
    select nullif(reference,'')::uuid into movement from invoice_payments where id=p_payment_id and invoice_id=p_invoice_id;
    if not found then raise exception 'Movimiento de pago no encontrado.'; end if;
    update invoice_payments set paid_at=p_payment_date::timestamptz where id=p_payment_id;
    if movement is not null then update receivable_movements set occurred_at=p_payment_date::timestamptz,metadata=metadata||jsonb_build_object('dateEditReason',trim(p_reason),'dateEditedBy',actor,'dateEditedAt',now()) where id=movement; end if;
  elsif p_due_date is not null then
    update invoices set due_date=p_due_date,approval_reason=trim(p_reason),updated_by=actor where id=p_invoice_id;
  else raise exception 'Debes indicar una fecha.';
  end if;
  insert into timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  values(inv.customer_id,inv.project_id,inv.orbit_event_id,'RECEIVABLE_DATE_UPDATED','Fecha financiera actualizada',trim(p_reason),actor,'Founder','Administrator','RECEIVABLE_DATE_UPDATED','Invoice',inv.id,'Se actualizó una fecha financiera desde el Perfil del Cliente.','receivable-date:'||gen_random_uuid(),trim(p_reason),actor);
  perform public.sync_financial_event(inv.project_id);
  perform public.sync_event_profitability(inv.project_id);
end $$;
revoke all on function public.update_receivable_dates(uuid,uuid,date,date,text) from public,anon;
grant execute on function public.update_receivable_dates(uuid,uuid,date,date,text) to authenticated;

create or replace function public.update_crm_event(p_project_id uuid,p_changes jsonb,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); current_project projects%rowtype; service_id uuid; quotation_id uuid; official numeric; applied numeric;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede editar eventos.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'El motivo del cambio es obligatorio.'; end if;
  select * into current_project from projects where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  update projects set event_date=coalesce(nullif(p_changes->>'date','')::date,event_date),event_time=coalesce(nullif(p_changes->>'time','')::time,event_time),project_type=coalesce(nullif(p_changes->>'type',''),project_type),location=coalesce(nullif(p_changes->>'location',''),location),city=coalesce(nullif(p_changes->>'municipality',''),city),approval_reason=trim(p_reason),updated_by=actor where id=p_project_id;
  select id into service_id from project_services where project_id=p_project_id order by id limit 1;
  if service_id is not null then update project_services set service_code=coalesce(nullif(p_changes->>'service',''),service_code),duration_hours=coalesce(nullif(p_changes->>'duration','')::numeric,duration_hours),extras=case when p_changes ? 'extras' then coalesce(p_changes->'extras','[]'::jsonb) else extras end where id=service_id; end if;
  select id into quotation_id from quotations where project_id=p_project_id and deleted_at is null order by created_at desc limit 1;
  if quotation_id is not null then
    if nullif(p_changes->>'transport','') is not null then update quotations set transport_total=(p_changes->>'transport')::numeric,subtotal=greatest(subtotal-transport_total+(p_changes->>'transport')::numeric,0),grand_total=greatest(grand_total-transport_total+(p_changes->>'transport')::numeric,0),approval_reason=trim(p_reason),updated_by=actor where id=quotation_id; end if;
    if nullif(p_changes->>'appliedPrice','') is not null then
      applied:=(p_changes->>'appliedPrice')::numeric;
      select coalesce(official_price,grand_total,0) into official from quotations where id=quotation_id;
      update quotations set final_customer_price=applied,grand_total=applied,price_difference=applied-official,approval_reason=trim(p_reason),updated_by=actor where id=quotation_id;
    end if;
  end if;
  insert into timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  values(current_project.customer_id,p_project_id,current_project.orbit_event_id,'CRM_EVENT_UPDATED','Evento actualizado desde CRM',trim(p_reason),actor,'Founder','Administrator','CRM_EVENT_UPDATED','Project',p_project_id,'Los datos operacionales y comerciales del evento fueron actualizados desde CRM.','crm-event-update:'||gen_random_uuid(),trim(p_reason),actor);
  perform public.sync_estimated_cost_sheet(p_project_id);
  perform public.sync_financial_event(p_project_id);
  perform public.sync_event_operation_cost(p_project_id);
  perform public.sync_event_profitability(p_project_id);
end $$;

commit;
