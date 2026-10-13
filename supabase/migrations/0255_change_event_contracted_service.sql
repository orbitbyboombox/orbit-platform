begin;

-- Servicio comercial: reemplazo conservador. No altera precio, contratos firmados ni pagos.
create or replace function public.change_event_contracted_service(
  p_project_id uuid,
  p_new_service text,
  p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_project public.projects%rowtype;
  v_service public.project_services%rowtype;
  v_count integer;
  v_code text := upper(trim(coalesce(p_new_service,'')));
  v_reason text := trim(coalesce(p_reason,''));
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.can_administer() then
    raise exception 'Solo Administración puede cambiar un servicio contratado.';
  end if;
  if length(v_reason) < 5 then
    raise exception 'Indica el motivo del cambio (mínimo 5 caracteres).';
  end if;
  if v_code not in ('CLASSIC','POLAROID','BLACK_STUDIO','BBOX360','HASHTAG','INSTABOX','VIDEO_LOUNGE') then
    raise exception 'Servicio no permitido para esta operación.';
  end if;
  select * into v_project from public.projects where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  if upper(coalesce(v_project.status,'')) in ('COMPLETED','FINISHED','CANCELLED','CANCELED','ARCHIVED') then
    raise exception 'No se puede cambiar el servicio de un evento finalizado o cancelado.';
  end if;
  select count(*) into v_count from public.project_services where project_id=p_project_id;
  if v_count <> 1 then raise exception 'Esta operación requiere exactamente un servicio contratado.'; end if;
  select * into v_service from public.project_services where project_id=p_project_id for update;
  if v_service.service_code = v_code then raise exception 'El evento ya tiene ese servicio.'; end if;
  if coalesce(jsonb_array_length(case when jsonb_typeof(v_service.extras)='array' then v_service.extras else '[]'::jsonb end),0) > 0 then
    raise exception 'El evento tiene extras: revisa compatibilidad y ajusta el contrato manualmente antes de cambiar el servicio.';
  end if;
  if v_service.duration_hours not in (2,3,4) then
    raise exception 'La duración requiere revisión manual.';
  end if;
  -- La disponibilidad física y la asignación deben revisarse antes: no reservar ni liberar equipos a ciegas.
  if exists (select 1 from public.assignments where project_id=p_project_id and deleted_at is null) then
    raise exception 'El evento ya tiene asignaciones. Revísalas y libera/reasigna recursos desde Logística antes del cambio.';
  end if;
  update public.project_services set service_code=v_code where id=v_service.id;
  insert into public.timeline_events(
    customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,
    source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by
  ) values (
    v_project.customer_id,p_project_id,v_project.orbit_event_id,'CRM_EVENT_UPDATED',
    'Cambio de servicio contratado',v_service.service_code||' → '||v_code,
    v_actor,'Founder','Administrator','EVENT_SERVICE_CHANGED','Project',p_project_id,
    'Cambio de servicio: '||v_service.service_code||' → '||v_code||'. Precio y pagos intactos. Revisar equipamiento y anexos contractuales.',
    'event-service-change:'||gen_random_uuid(),v_reason,v_actor
  );
end $$;

revoke all on function public.change_event_contracted_service(uuid,text,text) from public, anon;
grant execute on function public.change_event_contracted_service(uuid,text,text) to authenticated;
commit;
