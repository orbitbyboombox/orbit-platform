begin;

-- Canonical, read-only projection of WhatsApp conversations into Founder alerts.
-- Re-running reconciles and closes stale rows; no communications are sent.
create or replace function public.reconcile_whatsapp_founder_alerts()
returns integer language plpgsql security definer set search_path=public as $$
declare affected integer := 0;
begin
  if auth.role()<>'service_role' and not public.can_administer() then
    raise exception 'Solo Founder o Administración puede reconciliar pendientes.';
  end if;

  update public.internal_notifications
    set status='RESOLVED', action_required=false, read_at=coalesce(read_at,now())
  where notification_type like 'WHATSAPP_%' and status<>'RESOLVED';

  with latest as (
    select distinct on (c.customer_id)
      c.customer_id, c.occurred_at, upper(c.direction) direction
    from public.communications c
    where upper(coalesce(c.channel,'')) in ('WHATSAPP','WHATSAPP_BUSINESS')
    order by c.customer_id, c.occurred_at desc
  ), inbound as (
    select customer_id, max(occurred_at) occurred_at
    from public.communications
    where upper(coalesce(channel,'')) in ('WHATSAPP','WHATSAPP_BUSINESS') and upper(direction)='INBOUND'
    group by customer_id
  ), outbound as (
    select customer_id, max(occurred_at) occurred_at
    from public.communications
    where upper(coalesce(channel,'')) in ('WHATSAPP','WHATSAPP_BUSINESS') and upper(direction)='OUTBOUND'
    group by customer_id
  ), candidates as (
    select cs.id conversation_id, cs.customer_id, upper(coalesce(cs.status,'')) state,
      cs.nova_enabled, i.occurred_at inbound_at, o.occurred_at outbound_at,
      coalesce(i.occurred_at, cs.updated_at) activity_at,
      exists(select 1 from public.projects p where p.customer_id=cs.customer_id and p.deleted_at is null
        and upper(coalesce(p.pipeline_stage,p.operations->>'pipelineStage','NUEVO')) not in ('GANADO','PERDIDO','CANCELADO','PRUEBA','ARCHIVADO')) active_project
    from public.conversation_states cs
    left join inbound i on i.customer_id=cs.customer_id
    left join outbound o on o.customer_id=cs.customer_id
    where exists(select 1 from latest l where l.customer_id=cs.customer_id)
  ), alerts as (
    select conversation_id,customer_id,'WHATSAPP_WAITING_FOR_BOOMBOX' type,
      'WHATSAPP · ESPERANDO BOOMBOX' title,'Cliente envió un mensaje y espera respuesta humana.' message,'HIGH' priority
    from candidates where active_project and state not in ('WAITING_CUSTOMER','COMPLETED')
      and inbound_at is not null and (outbound_at is null or inbound_at>outbound_at)
    union all
    select conversation_id,customer_id,'WHATSAPP_HUMAN_STALE','WHATSAPP · CONTROL HUMANO VENCIDO',
      'La conversación está en control humano sin respuesta de BOOMBOX por más de 24 horas.','HIGH'
    from candidates where active_project and (state='HUMAN_HANDOFF' or nova_enabled=false)
      and inbound_at is not null and inbound_at>coalesce(outbound_at,'epoch'::timestamptz)
      and inbound_at < now()-interval '24 hours'
    union all
    select conversation_id,customer_id,'WHATSAPP_UNREAD_CRITICAL','WHATSAPP · NO LEÍDA CRÍTICA',
      'Mensaje inbound sin respuesta durante más de 48 horas.','CRITICAL'
    from candidates where active_project and state not in ('WAITING_CUSTOMER','COMPLETED')
      and inbound_at is not null and inbound_at>coalesce(outbound_at,'epoch'::timestamptz)
      and inbound_at < now()-interval '48 hours'
  )
  insert into public.internal_notifications(project_id,customer_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href,metadata)
  select null,a.customer_id,a.type,a.title,a.message,'UNREAD',
    'founder-action:whatsapp:'||a.type||':'||a.conversation_id,'COMMERCIAL',a.priority,true,
    'Conversation',a.conversation_id::text,'/leads#whatsapp-inbox',jsonb_build_object('source','CANONICAL_WHATSAPP_INBOX')
  from alerts a
  on conflict(correlation_id) do update set title=excluded.title,message=excluded.message,status='UNREAD',priority=excluded.priority,action_required=true,metadata=excluded.metadata;
  get diagnostics affected=row_count;
  return affected;
end;
$$;

revoke all on function public.reconcile_whatsapp_founder_alerts() from public,anon;
grant execute on function public.reconcile_whatsapp_founder_alerts() to authenticated,service_role;
commit;
