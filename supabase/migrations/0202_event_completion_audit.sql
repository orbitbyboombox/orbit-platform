begin;
create or replace function public.mark_event_completed(p_project_id uuid)
returns public.projects language plpgsql security definer set search_path=public as $$
declare item public.projects%rowtype;
begin
  if current_setting('request.jwt.claim.role',true)<>'service_role' and (auth.uid() is null or not public.can_administer()) then raise exception 'Acceso autorizado requerido.'; end if;
  update public.projects set status='Completed',updated_by=auth.uid(),updated_at=now()
    where id=p_project_id and deleted_at is null and upper(coalesce(status,'')) not in('CANCELLED','CANCELED','ARCHIVED','DELETED') returning * into item;
  if not found then raise exception 'Evento no disponible para completar.'; end if;
  insert into public.timeline_events(project_id,customer_id,event_type,title,description,new_state,reason,created_by)
  values(item.id,item.customer_id,'EVENT_OPERATIONAL_COMPLETED','Evento marcado como completado','El servicio fue realizado y completado operacionalmente.','Completed','Founder confirmó finalización operacional.',auth.uid());
  return item;
end $$;
grant execute on function public.mark_event_completed(uuid) to authenticated;
commit;
