begin;

create or replace function public.update_crm_event(p_project_id uuid,p_changes jsonb,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=auth.uid();
  current_project projects%rowtype;
  service_id uuid;
  target_quotation_id uuid;
  target_quotation_status text;
  commercial_locked boolean:=false;
  official numeric;
  applied numeric;
  booth_quantity numeric;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede editar eventos.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'El motivo del cambio es obligatorio.'; end if;
  select * into current_project from projects where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  select id,status into target_quotation_id,target_quotation_status from quotations where project_id=p_project_id and deleted_at is null order by created_at desc limit 1;
  commercial_locked:=coalesce(target_quotation_status,'') in ('ACCEPTED','CONVERTED');
  if not commercial_locked and p_changes ? 'boothQuantity' then
    booth_quantity:=nullif(p_changes->>'boothQuantity','')::numeric;
    if booth_quantity is null or booth_quantity<1 or booth_quantity<>trunc(booth_quantity) then raise exception 'La cantidad de cabinas debe ser un número entero mayor que cero.'; end if;
  end if;
  update projects set
    event_date=coalesce(nullif(p_changes->>'date','')::date,event_date),
    event_time=coalesce(nullif(p_changes->>'time','')::time,event_time),
    project_type=coalesce(nullif(p_changes->>'type',''),project_type),
    location=coalesce(nullif(p_changes->>'location',''),location),
    city=coalesce(nullif(p_changes->>'municipality',''),city),
    operations=case when booth_quantity is null then operations else coalesce(operations,'{}'::jsonb)||jsonb_build_object('boothQuantity',booth_quantity) end,
    approval_reason=trim(p_reason),updated_by=actor
  where id=p_project_id;
  if not commercial_locked then
    select id into service_id from project_services where project_id=p_project_id order by id limit 1;
    if service_id is not null then
      update project_services set
        service_code=coalesce(nullif(p_changes->>'service',''),service_code),
        duration_hours=coalesce(nullif(p_changes->>'duration','')::numeric,duration_hours),
        extras=case when p_changes ? 'extras' then coalesce(p_changes->'extras','[]'::jsonb) else extras end
      where id=service_id;
    end if;
    if target_quotation_id is not null then
      if booth_quantity is not null then update quotation_items set quantity=booth_quantity where quotation_id=target_quotation_id and item_type='SERVICE'; end if;
      if nullif(p_changes->>'transport','') is not null then
        update quotations set transport_total=(p_changes->>'transport')::numeric,subtotal=greatest(subtotal-transport_total+(p_changes->>'transport')::numeric,0),grand_total=greatest(grand_total-transport_total+(p_changes->>'transport')::numeric,0),approval_reason=trim(p_reason),updated_by=actor where id=target_quotation_id;
      end if;
      if nullif(p_changes->>'appliedPrice','') is not null then
        applied:=(p_changes->>'appliedPrice')::numeric;
        select coalesce(official_price,grand_total,0) into official from quotations where id=target_quotation_id;
        update quotations set final_customer_price=applied,grand_total=applied,price_difference=applied-official,approval_reason=trim(p_reason),updated_by=actor where id=target_quotation_id;
      end if;
      update agreements set rendered_contract=coalesce(rendered_contract,'{}'::jsonb)||jsonb_build_object(
        'service',coalesce(nullif(p_changes->>'service',''),rendered_contract->>'service'),
        'durationHours',coalesce(nullif(p_changes->>'duration','')::numeric,(rendered_contract->>'durationHours')::numeric),
        'boothQuantity',coalesce(booth_quantity,1),
        'transport',coalesce(nullif(p_changes->>'transport','')::numeric,0),
        'finalPrice',coalesce(nullif(p_changes->>'appliedPrice','')::numeric,0)
      ),updated_by=actor where project_id=p_project_id and status not in ('SIGNED','COMMERCIAL_DOCUMENT');
    end if;
  end if;
  insert into timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  values(current_project.customer_id,p_project_id,current_project.orbit_event_id,'CRM_EVENT_UPDATED','Evento actualizado desde CRM',trim(p_reason),actor,'Founder','Administrator','CRM_EVENT_UPDATED','Project',p_project_id,'Los datos operacionales actuales del evento fueron actualizados desde CRM.','crm-event-update:'||gen_random_uuid(),trim(p_reason),actor);
  perform public.sync_estimated_cost_sheet(p_project_id);
  perform public.sync_financial_event(p_project_id);
  perform public.sync_event_operation_cost(p_project_id);
  perform public.sync_event_profitability(p_project_id);
end $$;

commit;
