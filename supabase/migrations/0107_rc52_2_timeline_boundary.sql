begin;

-- Timeline is an eventually-consistent audit projection. Canonical operational
-- transactions can opt into deferral so no Timeline trigger can invalidate
-- Assignment, Settlement, Finance, Payroll, or the reviewed Request.
create or replace function public.defer_timeline_insert_during_operational_commit()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if current_setting('orbit.timeline_boundary',true)='deferred' then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists a_defer_timeline_during_operational_commit on public.timeline_events;
create trigger a_defer_timeline_during_operational_commit
before insert on public.timeline_events
for each row execute function public.defer_timeline_insert_during_operational_commit();

drop function if exists public.review_staff_assignment_request(uuid,boolean,text);
create function public.review_staff_assignment_request(p_request_id uuid,p_approved boolean,p_reason text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  req public.staff_assignment_requests%rowtype;
  occupied text[];
  roles text[];
  role_name text;
  assignment_ids uuid[];
  settlement_id uuid;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede revisar solicitudes.'; end if;
  select * into req from public.staff_assignment_requests where id=p_request_id for update;
  if req.id is null then raise exception 'Solicitud no encontrada.'; end if;
  if req.status<>'PENDING' then raise exception 'La solicitud ya fue revisada.'; end if;
  if not p_approved then
    update public.staff_assignment_requests set status='REJECTED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason=p_reason,updated_at=now() where id=req.id;
    return jsonb_build_object('requestId',req.id,'status','REJECTED');
  end if;

  -- Transaction-local only. It is automatically reset at commit/rollback.
  -- The BEFORE INSERT trigger suppresses every direct and trigger-generated
  -- Timeline row until Boundary B recreates the canonical audit projection.
  perform set_config('orbit.timeline_boundary','deferred',true);

  perform pg_advisory_xact_lock(hashtextextended(req.project_id::text||':operational-assignment',0));
  roles:=case when req.responsibility='ASSEMBLY_DISASSEMBLY' then array['ASSEMBLY','DISASSEMBLY'] else array[req.responsibility] end;
  foreach role_name in array roles loop
    if exists(select 1 from public.assignments where project_id=req.project_id and assignment_type=role_name and deleted_at is null and status not in('CANCELLED','REJECTED')) then
      raise exception 'La responsabilidad % ya fue asignada. La aprobación no creó duplicados.',role_name;
    end if;
  end loop;

  assignment_ids:=public.assign_event_operational_responsibility(req.project_id,req.staff_id,req.responsibility,coalesce(nullif(p_reason,''),'Solicitud aprobada por Founder'));
  update public.assignments set status='CONFIRMED',accepted_at=req.requested_at,response_at=now(),updated_by=auth.uid()
  where id=any(assignment_ids) and deleted_at is null;
  settlement_id:=public.refresh_staff_event_payment(req.project_id,req.staff_id,auth.uid());
  if settlement_id is null then raise exception 'No fue posible crear la liquidación canónica del Evento.'; end if;
  update public.event_staff_payments set status='CONFIRMED',updated_by=auth.uid() where id=settlement_id;
  update public.staff_assignment_requests set status='CONFIRMED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason=p_reason,updated_at=now() where id=req.id;

  occupied:=case when req.responsibility='ASSEMBLY_DISASSEMBLY' then array['ASSEMBLY','DISASSEMBLY','ASSEMBLY_DISASSEMBLY'] when req.responsibility in('ASSEMBLY','DISASSEMBLY') then array[req.responsibility,'ASSEMBLY_DISASSEMBLY'] else array[req.responsibility] end;
  update public.staff_assignment_requests set status='REJECTED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason='Responsabilidad asignada a otro colaborador',updated_at=now()
  where project_id=req.project_id and id<>req.id and status='PENDING' and responsibility=any(occupied);

  return jsonb_build_object('requestId',req.id,'status','CONFIRMED','assignmentIds',assignment_ids,'settlementId',settlement_id);
end $$;

grant execute on function public.review_staff_assignment_request(uuid,boolean,text) to authenticated;

commit;
