-- Atomic Staff event completion and monthly recalculation.
-- No customer communication or financial movement is created by this function.
create or replace function public.complete_staff_settlement_event_operationally(p_project_id uuid,p_correlation_id text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=auth.uid();
  project_row public.projects%rowtype;
  payment_row record;
  account_row public.staff_monthly_accounts%rowtype;
  correlation text:=coalesce(nullif(trim(p_correlation_id),''), 'CMP-'||p_project_id::text);
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede completar Eventos Staff.'; end if;
  select * into project_row from public.projects where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Evento no disponible para completar.'; end if;
  if upper(coalesce(project_row.status,'')) in ('CANCELLED','CANCELED','ARCHIVED','DELETED') then raise exception 'El Evento está cerrado y no puede completarse.'; end if;
  if project_row.status<>'Completed' then
    update public.projects set status='Completed',updated_by=actor,updated_at=now() where id=p_project_id;
  end if;
  if not exists(select 1 from public.timeline_events where project_id=p_project_id and event_type='EVENT_OPERATIONAL_COMPLETED') then
    insert into public.timeline_events(project_id,customer_id,event_type,title,description,new_state,reason,correlation_id,created_by)
    values(p_project_id,project_row.customer_id,'EVENT_OPERATIONAL_COMPLETED','Evento marcado como completado','El servicio fue realizado y completado operacionalmente.','Completed','Founder confirmó finalización operacional.',correlation,actor);
  end if;
  select payment.staff_id,project_row.event_date into payment_row
  from public.event_staff_payments payment
  where payment.project_id=p_project_id and payment.status='CONFIRMED' and payment.deleted_at is null
  order by payment.created_at asc limit 1;
  if payment_row.staff_id is not null then
    select * into account_row from public.ensure_staff_monthly_account(payment_row.staff_id,payment_row.event_date);
  end if;
  return jsonb_build_object('projectId',p_project_id,'status','Completed','staffId',payment_row.staff_id,'accountId',account_row.id,'idempotent',project_row.status='Completed');
end $$;
revoke all on function public.complete_staff_settlement_event_operationally(uuid,text) from public,anon;
grant execute on function public.complete_staff_settlement_event_operationally(uuid,text) to authenticated,service_role;
