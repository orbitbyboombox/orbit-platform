-- Explicit Founder resolution for REVIEW_REQUIRED capacity results.
alter table public.project_operational_contracts add column if not exists capacity_override_reason text;
alter table public.project_operational_contracts add column if not exists capacity_override_at timestamptz;
alter table public.project_operational_contracts add column if not exists capacity_override_by uuid references auth.users(id);

create or replace function public.set_event_capacity_override(p_project_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); reason text:=nullif(trim(p_reason),'');
begin
  if actor is null or public.current_orbit_role() not in ('CEO','ADMINISTRATOR') then raise exception 'Solo Founder/Admin puede resolver una revisión de capacidad.'; end if;
  if reason is null then raise exception 'El motivo de override es obligatorio.'; end if;
  update public.project_operational_contracts set capacity_override_reason=reason,capacity_override_at=now(),capacity_override_by=actor,updated_by=actor where project_id=p_project_id;
  if not found then raise exception 'Contrato operacional no preparado.'; end if;
  insert into public.audit_events(entity_type,entity_id,action,reason,new_state,actor_id,occurred_at)
    values('PROJECT_CAPACITY',p_project_id::text,'FOUNDER_OVERRIDE',reason,jsonb_build_object('projectId',p_project_id),actor,now());
  return jsonb_build_object('projectId',p_project_id,'override',true);
end $$;
revoke all on function public.set_event_capacity_override(uuid,text) from public,anon;
grant execute on function public.set_event_capacity_override(uuid,text) to authenticated,service_role;

create or replace function public.enforce_reservation_capacity_gate() returns trigger
language plpgsql security definer set search_path=public as $$
declare result jsonb; override_reason text;
begin
  if new.status='CONFIRMED' and coalesce(old.status,'')<>'CONFIRMED' then
    result:=public.preflight_reservation_capacity(new.project_id);
    if result->>'status'='UNAVAILABLE' then raise exception 'Reserva bloqueada por capacidad operativa: %',result->>'reasonCode' using errcode='P0001',detail=result::text; end if;
    if result->>'status'='REVIEW_REQUIRED' then
      select capacity_override_reason into override_reason from public.project_operational_contracts where project_id=new.project_id;
      if nullif(trim(coalesce(override_reason,'')),'') is null then raise exception 'Reserva requiere revisión de capacidad: %',result->>'reasonCode' using errcode='P0001',detail=result::text; end if;
    end if;
  end if;
  return new;
end $$;
