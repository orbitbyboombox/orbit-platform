begin;

create or replace function public.refresh_logistics_notifications(p_reference timestamptz default now())
returns integer language plpgsql security definer set search_path=public as $$
declare item record; changed_count integer:=0; priority_value text; local_day date:=(p_reference at time zone 'America/Santiago')::date;
begin
  for item in select p.id,p.customer_id,p.name,p.event_date
    from public.projects p join public.project_operational_contracts c on c.project_id=p.id
    where p.deleted_at is null and p.status not in('CANCELLED','Cancelled','Archived','Completed')
      and c.logistics_mode<>'NOT_REQUIRED' and c.logistics_status in('PENDING','PLANNED')
      and p.event_date between local_day and local_day+3
      and jsonb_array_length(coalesce(public.phase_e_logistics_readiness_reason(p.id),'[]'::jsonb))>0 loop
    priority_value:=case when item.event_date=local_day then 'CRITICAL' else 'HIGH' end;
    insert into public.internal_notifications(project_id,customer_id,notification_type,title,message,status,correlation_id,
      category,priority,action_required,entity_type,entity_id,related_href,metadata)
    values(item.id,item.customer_id,'LOGISTICS_READINESS_ALERT',
      case when item.event_date=local_day then 'Logística crítica para hoy' else 'Logística pendiente antes del Evento' end,
      item.name||' · '||item.event_date||' requiere completar su plan logístico.','UNREAD',
      'logistics-readiness:'||item.id||':'||item.event_date,'OPERATIONS',priority_value,true,'Project',item.id,
      '/projects/'||item.id||'#event-logistics',jsonb_build_object('eventDate',item.event_date,'referenceDate',local_day))
    on conflict(correlation_id) do update set title=excluded.title,message=excluded.message,status='UNREAD',
      priority=excluded.priority,action_required=true,related_href=excluded.related_href,metadata=excluded.metadata
    where internal_notifications.priority is distinct from excluded.priority
       or internal_notifications.title is distinct from excluded.title;
    if found then changed_count:=changed_count+1; end if;
  end loop;
  return changed_count;
end $$;

revoke all on function public.refresh_logistics_notifications(timestamptz) from public,anon;
grant execute on function public.refresh_logistics_notifications(timestamptz) to authenticated,service_role;

commit;
