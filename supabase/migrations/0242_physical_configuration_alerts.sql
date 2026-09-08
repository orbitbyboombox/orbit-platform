begin;

create or replace function public.reconcile_operational_agenda_alerts()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare n integer:=0;
begin
  if auth.role()<>'service_role' and not public.can_administer() then
    raise exception 'Acceso Founder requerido.';
  end if;

  update internal_notifications
     set status='RESOLVED', action_required=false, read_at=coalesce(read_at,now())
   where notification_type in ('STAFF_CONFLICT','CHECKLIST_CRITICAL','PRE_EVENT_REMINDER_ERROR','PRE_EVENT_REMINDER_BLOCKED','PHYSICAL_CONFIGURATION_MISSING')
     and status<>'RESOLVED';

  insert into internal_notifications(project_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href)
  select c.project_id,'CHECKLIST_CRITICAL','CHECKLIST CRÍTICO','Checklist operacional incompleto para evento próximo.','UNREAD','agenda:checklist-critical:'||c.project_id,'OPERATIONS',case when p.event_date<current_date+2 then 'CRITICAL' when p.event_date<current_date+3 then 'HIGH' else 'MEDIUM' end,true,'Project',c.project_id,'/projects/'||c.project_id||'#operations-checklist'
    from event_checklists c join projects p on p.id=c.project_id
   where c.status='IN_PROGRESS' and p.deleted_at is null and p.event_date<current_date+7
     and exists(select 1 from event_checklist_items i where i.checklist_id=c.id and i.mandatory and not i.completed)
   on conflict(correlation_id) do update set status='UNREAD',action_required=true;

  insert into internal_notifications(project_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href)
  select c.project_id,case when c.status='FAILED' then 'PRE_EVENT_REMINDER_ERROR' else 'PRE_EVENT_REMINDER_BLOCKED' end,'REMINDER PRE-EVENTO REQUIERE ATENCIÓN','El recordatorio pre-evento requiere revisión.','UNREAD','agenda:reminder:'||c.project_id||':'||c.status,'OPERATIONS','HIGH',true,'Project',c.project_id,'/projects/'||c.project_id||'#pre-event-reminder'
    from communications c join projects p on p.id=c.project_id
   where c.communication_type='PRE_EVENT_REMINDER' and c.status in('FAILED','BLOCKED') and p.deleted_at is null and p.event_date<current_date+7
   on conflict(correlation_id) do update set status='UNREAD',action_required=true;

  insert into internal_notifications(project_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href)
  select p.id,'PHYSICAL_CONFIGURATION_MISSING','CONFIGURACIÓN FÍSICA PENDIENTE','Evento próximo requiere definir una configuración física.','UNREAD','agenda:physical-configuration:'||p.id,'OPERATIONS',case when p.event_date<=current_date+1 then 'CRITICAL' else 'HIGH' end,true,'Project',p.id,'/projects/'||p.id||'#physical-resource-planning'
    from projects p
   where p.deleted_at is null and p.event_date<current_date+7
     and upper(coalesce(p.status,'')) not in ('CANCELLED','CANCELED','ARCHIVED','CLOSED')
     and upper(coalesce(p.pipeline_stage,'')) not in ('CANCELADO','ARCHIVADO','PRUEBA','PERDIDO','GANADO')
     and upper(coalesce(nullif(trim(p.operations->>'physicalConfiguration'),''),'UNDEFINED'))='UNDEFINED'
     and exists(select 1 from event_operational_requirements r where r.project_id=p.id and r.status='ACTIVE' and r.requirement_type='PHYSICAL_UNIT')
   on conflict(correlation_id) do update set status='UNREAD',action_required=true,priority=excluded.priority,related_href=excluded.related_href;

  get diagnostics n=row_count;
  return n;
end;
$$;

revoke all on function public.reconcile_operational_agenda_alerts() from public,anon;
grant execute on function public.reconcile_operational_agenda_alerts() to authenticated,service_role;
commit;
