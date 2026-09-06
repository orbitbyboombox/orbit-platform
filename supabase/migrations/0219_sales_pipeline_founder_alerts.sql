begin;

-- Canonical, idempotent Founder Action Center projection for Sales Pipeline.
-- One correlation key per project/type makes reconciliation safe to repeat.
create or replace function public.reconcile_sales_pipeline_founder_alerts()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare affected integer:=0;
begin
  if auth.role()<>'service_role' and not public.can_administer() then
    raise exception 'Solo Founder o Administración puede reconciliar pendientes.';
  end if;

  -- Rebuild this projection atomically on every run; correlation_id preserves
  -- one row per entity/type while stale conditions are closed automatically.
  update internal_notifications set status='RESOLVED',action_required=false,read_at=coalesce(read_at,now())
  where notification_type like 'SALES_%' and status<>'RESOLVED';

  with candidates as (
    select p.id,p.customer_id,
      upper(coalesce(p.pipeline_stage,p.operations->>'pipelineStage','NUEVO')) as stage,
      coalesce(p.next_action_at,(p.operations->>'nextActionAt')::timestamptz) as next_action_at,
      coalesce(p.last_commercial_activity_at,p.updated_at,p.created_at) as activity_at,
      exists(select 1 from communications c where c.project_id=p.id and upper(c.direction)='INBOUND'
        and upper(coalesce(c.channel,''))='WHATSAPP'
        and c.occurred_at>coalesce(p.last_outbound_at,'epoch'::timestamptz)) as customer_replied,
      exists(select 1 from conversation_states cs where cs.customer_id=p.customer_id and upper(coalesce(cs.status,''))='HUMAN_HANDOFF') as human_handoff
    from projects p
    where p.deleted_at is null and upper(coalesce(p.status,'')) not in('ARCHIVED','CANCELLED','DELETED')
  ), alerts as (
    select id,customer_id,'SALES_LEAD_UNATTENDED' type,'NUEVO LEAD SIN ATENDER' title,'Lead nuevo requiere primera atención.' message,'HIGH' priority from candidates where stage='NUEVO' and next_action_at is null
    union all select id,customer_id,'SALES_QUOTE_NO_FOLLOWUP','COTIZACIÓN SIN SEGUIMIENTO','Cotización activa sin próxima acción definida.','HIGH' from candidates where stage='COTIZACIÓN' and next_action_at is null
    union all select id,customer_id,'SALES_FOLLOWUP_OVERDUE','FOLLOW-UP VENCIDO','La próxima acción comercial está vencida.','CRITICAL' from candidates where stage not in('GANADO','PERDIDO') and next_action_at<now()
    union all select id,customer_id,'SALES_NO_NEXT_ACTION','LEAD ACTIVO SIN PRÓXIMA ACCIÓN','Define la próxima acción comercial del lead.','MEDIUM' from candidates where stage not in('GANADO','PERDIDO') and next_action_at is null
    union all select id,customer_id,'SALES_CUSTOMER_REPLIED','CLIENTE RESPONDIÓ · ATENCIÓN PENDIENTE','Cliente respondió por WhatsApp y espera atención.','HIGH' from candidates where customer_replied
    union all select id,customer_id,'SALES_RESERVATION_PENDING','RESERVA PENDIENTE DE CIERRE','La reserva requiere cierre operativo.','HIGH' from candidates where stage='RESERVA PENDIENTE'
    union all select id,customer_id,'SALES_LEAD_STALLED','LEAD ESTANCADO','Lead activo sin actividad comercial reciente.','MEDIUM' from candidates where stage not in('GANADO','PERDIDO') and activity_at<now()-interval '7 days'
  )
  insert into internal_notifications(project_id,customer_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href,metadata)
  select a.id,a.customer_id,a.type,a.title,a.message,'UNREAD','founder-action:sales:'||a.type||':'||a.id,'COMMERCIAL',a.priority,true,'Project',a.id::text,'/leads',jsonb_build_object('source','CANONICAL_SALES_PIPELINE')
  from alerts a
  on conflict(correlation_id) do update set title=excluded.title,message=excluded.message,status='UNREAD',category=excluded.category,priority=excluded.priority,action_required=true,metadata=excluded.metadata;
  get diagnostics affected=row_count;

  return affected;
end;
$$;

revoke all on function public.reconcile_sales_pipeline_founder_alerts() from public,anon;
grant execute on function public.reconcile_sales_pipeline_founder_alerts() to authenticated,service_role;
commit;
