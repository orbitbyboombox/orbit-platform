begin;
create or replace function public.reconcile_operational_agenda_alerts() returns integer language plpgsql security definer set search_path=public as $$
declare n integer:=0; begin
  if auth.role()<>'service_role' and not public.can_administer() then raise exception 'Acceso Founder requerido.'; end if;
  update internal_notifications set status='RESOLVED',action_required=false,read_at=coalesce(read_at,now()) where notification_type in('STAFF_CONFLICT','CHECKLIST_CRITICAL','PRE_EVENT_REMINDER_ERROR','PRE_EVENT_REMINDER_BLOCKED') and status<>'RESOLVED';
  insert into internal_notifications(project_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href)
  select distinct a.project_id,'STAFF_CONFLICT','CONFLICTO DE STAFF','El mismo colaborador tiene asignaciones con solapamiento horario real.','UNREAD','agenda:staff-conflict:'||a.staff_id||':'||a.project_id,'OPERATIONS',case when p.event_date<current_date+2 then 'CRITICAL' when p.event_date<current_date+3 then 'HIGH' else 'MEDIUM' end,true,'Project',a.project_id,'/operations/week'
  from assignments a join assignments b on a.staff_id=b.staff_id and a.project_id<>b.project_id and a.start_time<b.finish_time and b.start_time<a.finish_time join projects p on p.id=a.project_id where a.deleted_at is null and b.deleted_at is null and a.start_time is not null and a.finish_time is not null and b.start_time is not null and b.finish_time is not null and p.deleted_at is null
  on conflict(correlation_id) do update set status='UNREAD',action_required=true;
  get diagnostics n=row_count; return n;
end; $$;
revoke all on function public.reconcile_operational_agenda_alerts() from public,anon; grant execute on function public.reconcile_operational_agenda_alerts() to authenticated,service_role;
commit;
