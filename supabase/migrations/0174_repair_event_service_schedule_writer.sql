begin;

create or replace function public.update_event_service_schedule(
  p_project_id uuid,
  p_service_start_local text,
  p_service_end_local text,
  p_staff_call_local text default null
)
returns void language plpgsql security invoker set search_path=public as $$
declare
  actor uuid:=auth.uid();
  service_start timestamptz;
  service_end timestamptz;
  staff_call timestamptz;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Administración puede editar horarios operacionales.';
  end if;

  service_start:=p_service_start_local::timestamp at time zone 'America/Santiago';
  service_end:=p_service_end_local::timestamp at time zone 'America/Santiago';
  if service_end<=service_start then service_end:=service_end+interval '1 day'; end if;
  if service_end-service_start>interval '24 hours' then
    raise exception 'El servicio no puede superar 24 horas.';
  end if;
  staff_call:=case
    when nullif(p_staff_call_local,'') is null then null
    else p_staff_call_local::timestamp at time zone 'America/Santiago'
  end;

  insert into public.project_operational_contracts(
    project_id,
    service_start_at,
    service_end_at,
    staff_arrival_at,
    prepared_by,
    updated_by
  ) values (
    p_project_id,
    service_start,
    service_end,
    staff_call,
    actor,
    actor
  )
  on conflict(project_id) do update set
    service_start_at=excluded.service_start_at,
    service_end_at=excluded.service_end_at,
    staff_arrival_at=excluded.staff_arrival_at,
    updated_by=actor,
    updated_at=now();

  if staff_call is not null then
    update public.assignments
    set staff_call_at=staff_call,
        staff_call_source='DERIVED',
        updated_by=actor
    where project_id=p_project_id
      and deleted_at is null
      and coalesce(staff_call_source,'DERIVED')='DERIVED';
  end if;
end $$;

revoke all on function public.update_event_service_schedule(uuid,text,text,text) from public,anon;
grant execute on function public.update_event_service_schedule(uuid,text,text,text) to authenticated;

commit;
