begin;

drop function if exists public.confirm_reservation_operational_pipeline(uuid);
create function public.confirm_reservation_operational_pipeline(p_project_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=coalesce(auth.uid(),p_actor_id);p public.projects%rowtype;q_id uuid;estimate public.estimated_cost_sheets%rowtype;truth public.financial_event_records%rowtype;profit_id uuid;actor_role text;
begin
  select role into actor_role from public.profiles where id=actor;
  if actor is null or actor_role is null then raise exception'Acceso interno requerido.';end if;
  if auth.uid()is not null and auth.uid()<>p_actor_id then raise exception'El actor del pipeline no coincide con la sesión.';end if;
  select * into p from public.projects where id=p_project_id and deleted_at is null for update;
  if not found then raise exception'No encontramos la reserva que se debe confirmar.';end if;

  update public.projects set operations=coalesce(operations,'{}'::jsonb)||jsonb_build_object('stage','Reserva confirmada','commercialStage','Confirmed','operationalPipeline','UNIFIED','operationalPipelineAt',now()),updated_by=actor where id=p.id;
  update public.crm_reservations set status='CONFIRMED',updated_by=actor,updated_at=now()where project_id=p.id and status<>'CONFIRMED';
  select id into q_id from public.quotations where project_id=p.id and deleted_at is null order by case when status='ACCEPTED'then 0 else 1 end,created_at desc limit 1;
  if q_id is null then raise exception'La reserva no tiene una propuesta comercial para confirmar.';end if;
  update public.quotations set status='ACCEPTED',approved_by=coalesce(approved_by,actor),approved_at=coalesce(approved_at,now()),updated_by=actor,updated_at=now()where id=q_id and status<>'ACCEPTED';

  perform public.sync_estimated_cost_sheet(p.id);perform public.sync_financial_event(p.id);perform public.sync_event_operation_cost(p.id);profit_id:=public.sync_event_profitability(p.id);
  select * into estimate from public.estimated_cost_sheets where project_id=p.id;select * into truth from public.financial_event_records where project_id=p.id;
  if estimate.id is null or truth.id is null or profit_id is null then raise exception'El pipeline operacional no generó todos los registros financieros requeridos.';end if;
  if not exists(select 1 from public.timeline_events where correlation_id='confirmed-operation-pipeline:'||p.id)then insert into public.timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,new_state,created_by)values(p.customer_id,p.id,p.orbit_event_id,'OPERATION_PIPELINE_CONFIRMED','Pipeline operacional confirmado','Costos, rentabilidad, Dashboard y Business Intelligence sincronizados.',actor,'ORBIT','System','OPERATION_PIPELINE_CONFIRMED','Project',p.id,'La reserva utiliza el pipeline operacional unificado.','confirmed-operation-pipeline:'||p.id,'CONFIRMED',actor);end if;
  return jsonb_build_object('projectId',p.id,'quotationId',q_id,'estimatedCostId',estimate.id,'financialEventId',truth.id,'profitabilityId',profit_id,'personnelCost',truth.personnel_cost,'operationalCost',truth.operational_resources_cost,'totalEventCost',truth.total_operational_cost,'status','CONFIRMED');
end$$;

revoke all on function public.confirm_reservation_operational_pipeline(uuid,uuid)from public,anon;
grant execute on function public.confirm_reservation_operational_pipeline(uuid,uuid)to authenticated,service_role;
commit;
