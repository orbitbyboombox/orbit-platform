begin;

-- Phase D keeps assignments and settlements canonical. This table stores only
-- the Event-owned staffing demand/publication capacity that those aggregates
-- need in order to support more than one collaborator per role.
create table if not exists public.event_staff_requirements(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null check(role in('OPERATOR','ASSEMBLY','DISASSEMBLY')),
  required_quantity integer not null check(required_quantity between 0 and 99),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique(project_id,role)
);
create index if not exists event_staff_requirements_publication_idx
  on public.event_staff_requirements(project_id,published,role);
alter table public.event_staff_requirements enable row level security;
drop policy if exists event_staff_requirements_internal_read on public.event_staff_requirements;
create policy event_staff_requirements_internal_read on public.event_staff_requirements
  for select using(public.is_internal_user());
drop policy if exists event_staff_requirements_admin_write on public.event_staff_requirements;
create policy event_staff_requirements_admin_write on public.event_staff_requirements
  for all using(public.can_administer()) with check(public.can_administer());
revoke all on public.event_staff_requirements from anon,authenticated;
grant select,insert,update on public.event_staff_requirements to authenticated;

create or replace function public.set_event_staff_requirement(
  p_project_id uuid,p_role text,p_required_quantity integer,p_published boolean
) returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid; event_status text; event_date date;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede configurar Staff.'; end if;
  if p_role not in('OPERATOR','ASSEMBLY','DISASSEMBLY') then raise exception 'Responsabilidad inválida.'; end if;
  if p_required_quantity<0 or p_required_quantity>99 then raise exception 'Cantidad requerida inválida.'; end if;
  select status,projects.event_date into event_status,event_date from public.projects where id=p_project_id and deleted_at is null;
  if event_status is null then raise exception 'Evento no encontrado.'; end if;
  if p_published and (event_status in('CANCELLED','CLOSED','COMPLETED','ARCHIVED') or event_date<timezone('America/Santiago',now())::date or event_date>timezone('America/Santiago',now())::date+15) then
    raise exception 'Solo puedes publicar Eventos activos dentro de los próximos 15 días.';
  end if;
  insert into public.event_staff_requirements(project_id,role,required_quantity,published,created_by,updated_by)
  values(p_project_id,p_role,p_required_quantity,p_published,auth.uid(),auth.uid())
  on conflict(project_id,role) do update set required_quantity=excluded.required_quantity,published=excluded.published,updated_at=now(),updated_by=auth.uid()
  returning id into result;
  return result;
end $$;
grant execute on function public.set_event_staff_requirement(uuid,text,integer,boolean) to authenticated;

alter table public.staff_event_checkins drop constraint if exists staff_event_checkins_status_check;
alter table public.staff_event_checkins add constraint staff_event_checkins_status_check check(status in(
  'ON_THE_WAY','ARRIVED','ASSEMBLY_STARTED','ASSEMBLY_COMPLETED','EVENT_STARTED','EVENT_FINISHED','DISASSEMBLY_STARTED','DISASSEMBLY_COMPLETED'
));

create or replace function public.record_staff_portal_checkin(p_staff_id uuid,p_project_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid; event_code text; customer uuid; label text; required_role text; assignment_id uuid;
begin
  required_role:=case when p_status in('ASSEMBLY_STARTED','ASSEMBLY_COMPLETED') then 'ASSEMBLY'
    when p_status in('EVENT_STARTED','EVENT_FINISHED') then 'OPERATOR'
    when p_status in('DISASSEMBLY_STARTED','DISASSEMBLY_COMPLETED') then 'DISASSEMBLY' end;
  if p_status not in('ON_THE_WAY','ARRIVED','ASSEMBLY_STARTED','ASSEMBLY_COMPLETED','EVENT_STARTED','EVENT_FINISHED','DISASSEMBLY_STARTED','DISASSEMBLY_COMPLETED') then raise exception 'Estado operacional inválido.'; end if;
  select id into assignment_id from public.assignments where project_id=p_project_id and staff_id=p_staff_id and deleted_at is null
    and status not in('CANCELLED','REJECTED') and (required_role is null or assignment_type=required_role) order by created_at limit 1;
  if assignment_id is null then raise exception 'Esta acción no corresponde a tus responsabilidades confirmadas.'; end if;
  if p_status<>'ON_THE_WAY' and p_status<>'ARRIVED' and not exists(select 1 from public.staff_event_checkins where project_id=p_project_id and staff_id=p_staff_id and status='ARRIVED') then raise exception 'Registra primero tu llegada.'; end if;
  if p_status='ASSEMBLY_COMPLETED' and not exists(select 1 from public.staff_event_checkins where project_id=p_project_id and staff_id=p_staff_id and status='ASSEMBLY_STARTED') then raise exception 'Inicia primero el montaje.'; end if;
  if p_status='EVENT_FINISHED' and not exists(select 1 from public.staff_event_checkins where project_id=p_project_id and staff_id=p_staff_id and status='EVENT_STARTED') then raise exception 'Inicia primero el servicio.'; end if;
  if p_status='DISASSEMBLY_COMPLETED' and not exists(select 1 from public.staff_event_checkins where project_id=p_project_id and staff_id=p_staff_id and status='DISASSEMBLY_STARTED') then raise exception 'Inicia primero el desmontaje.'; end if;
  insert into public.staff_event_checkins(project_id,staff_id,status) values(p_project_id,p_staff_id,p_status)
    on conflict(project_id,staff_id,status) do update set occurred_at=staff_event_checkins.occurred_at returning id into result;
  label:=case p_status when 'ON_THE_WAY' then 'En camino' when 'ARRIVED' then 'Llegó' when 'ASSEMBLY_STARTED' then 'Montaje iniciado' when 'ASSEMBLY_COMPLETED' then 'Montaje listo' when 'EVENT_STARTED' then 'Servicio iniciado' when 'EVENT_FINISHED' then 'Servicio finalizado' when 'DISASSEMBLY_STARTED' then 'Desmontaje iniciado' else 'Desmontaje completo' end;
  if p_status in('ASSEMBLY_COMPLETED','EVENT_FINISHED','DISASSEMBLY_COMPLETED') then
    update public.assignments set status='COMPLETED',response_at=now() where project_id=p_project_id and staff_id=p_staff_id and assignment_type=required_role and deleted_at is null and status not in('CANCELLED','REJECTED');
  end if;
  select orbit_event_id,customer_id into event_code,customer from public.projects where id=p_project_id;
  insert into public.timeline_events(customer_id,project_id,staff_id,event_type,title,description,orbit_event_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id)
  values(customer,p_project_id,p_staff_id,p_status,label,label,event_code,'Staff','StaffPortal',p_status,'StaffEventCheckin',result,label||' registrado desde Portal Staff.','staff-checkin:'||result)
  on conflict(correlation_id) do nothing;
  return result;
end $$;
revoke all on function public.record_staff_portal_checkin(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_staff_portal_checkin(uuid,uuid,text) to service_role;

-- Existing Events use the established OPERATOR x1 rule. Assembly and
-- disassembly remain explicit Founder decisions; no quantities are invented.
insert into public.event_staff_requirements(project_id,role,required_quantity,published)
select p.id,'OPERATOR',1,coalesce(pub.published,false) from public.projects p
left join public.staff_event_publications pub on pub.project_id=p.id
where p.deleted_at is null
on conflict(project_id,role) do nothing;

commit;

begin;

create or replace function public.request_staff_responsibility(p_staff_id uuid,p_project_id uuid,p_responsibility text)
returns uuid language plpgsql security definer set search_path=public as $$
declare roles text[]; role_name text; result uuid; required_count integer; assigned_count integer;
begin
  if p_responsibility not in('OPERATOR','ASSEMBLY','DISASSEMBLY','ASSEMBLY_DISASSEMBLY') then raise exception 'Responsabilidad inválida.'; end if;
  roles:=case when p_responsibility='ASSEMBLY_DISASSEMBLY' then array['ASSEMBLY','DISASSEMBLY'] else array[p_responsibility] end;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':staff-request',0));
  if not exists(select 1 from public.staff_event_publications where project_id=p_project_id and published) then raise exception 'Este evento ya no está disponible.'; end if;
  if not exists(select 1 from public.staff where id=p_staff_id and status='ACTIVE' and deleted_at is null and capabilities @> roles) then raise exception 'No tienes habilitada esta responsabilidad.'; end if;
  foreach role_name in array roles loop
    select required_quantity into required_count from public.event_staff_requirements where project_id=p_project_id and role=role_name and published;
    if coalesce(required_count,0)=0 then raise exception 'La responsabilidad % no está publicada.',role_name; end if;
    select count(*) into assigned_count from public.assignments where project_id=p_project_id and assignment_type=role_name and deleted_at is null and status not in('CANCELLED','REJECTED');
    if assigned_count>=required_count then raise exception 'El cupo de % ya está completo.',role_name; end if;
  end loop;
  select id into result from public.staff_assignment_requests where project_id=p_project_id and staff_id=p_staff_id and responsibility=p_responsibility and status='PENDING';
  if result is null then insert into public.staff_assignment_requests(project_id,staff_id,responsibility) values(p_project_id,p_staff_id,p_responsibility) returning id into result; end if;
  return result;
end $$;
revoke all on function public.request_staff_responsibility(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.request_staff_responsibility(uuid,uuid,text) to service_role;

-- Canonical assignment creation no longer cancels peers in the same role.
create or replace function public.assign_event_operational_responsibility(p_project_id uuid,p_staff_id uuid,p_responsibility text,p_reason text)
returns uuid[] language plpgsql security invoker set search_path=public as $$
declare roles text[]; role_name text; created uuid[]:='{}'; ids uuid[]; combined_net numeric(14,2); payment_id uuid;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede asignar Staff.'; end if;
  if p_responsibility not in('OPERATOR','ASSEMBLY','DISASSEMBLY','ASSEMBLY_DISASSEMBLY') then raise exception 'Responsabilidad inválida.'; end if;
  roles:=case when p_responsibility='ASSEMBLY_DISASSEMBLY' then array['ASSEMBLY','DISASSEMBLY'] else array[p_responsibility] end;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':operational-assignment',0));
  if not exists(select 1 from public.staff where id=p_staff_id and status='ACTIVE' and deleted_at is null and capabilities @> roles) then raise exception 'El colaborador no está disponible o no tiene las responsabilidades requeridas.'; end if;
  foreach role_name in array roles loop
    if exists(select 1 from public.assignments where project_id=p_project_id and staff_id=p_staff_id and assignment_type=role_name and deleted_at is null and status not in('CANCELLED','REJECTED')) then raise exception 'El colaborador ya tiene la responsabilidad %.',role_name; end if;
    ids:=public.assign_staff_group(array[p_staff_id],p_project_id,role_name,'',coalesce(nullif(p_reason,''),'Asignación operacional'));
    created:=created||ids;
  end loop;
  if p_responsibility='ASSEMBLY_DISASSEMBLY' then
    select coalesce(amount,15000) into combined_net from public.cost_master_entries where code='ASSEMBLY_DISASSEMBLY' and enabled and deleted_at is null;
    payment_id:=public.refresh_staff_event_payment(p_project_id,p_staff_id,auth.uid());
    update public.event_staff_payments set automatic_assembly_payment=round(combined_net/2),automatic_disassembly_payment=combined_net-round(combined_net/2),assembly_payment=round(combined_net/2),disassembly_payment=combined_net-round(combined_net/2),override_reason=null,override_by=null,override_at=null,updated_by=auth.uid() where id=payment_id;
  end if;
  return created;
end $$;
grant execute on function public.assign_event_operational_responsibility(uuid,uuid,text,text) to authenticated;

create or replace function public.review_staff_assignment_request(p_request_id uuid,p_approved boolean,p_reason text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare req public.staff_assignment_requests%rowtype; roles text[]; role_name text; assignment_ids uuid[]; settlement_id uuid; required_count integer; assigned_count integer; capacity_full boolean:=true;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede revisar solicitudes.'; end if;
  select * into req from public.staff_assignment_requests where id=p_request_id for update;
  if req.id is null then raise exception 'Solicitud no encontrada.'; end if;
  if req.status<>'PENDING' then raise exception 'La solicitud ya fue revisada.'; end if;
  if not p_approved then update public.staff_assignment_requests set status='REJECTED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason=p_reason,updated_at=now() where id=req.id; return jsonb_build_object('requestId',req.id,'status','REJECTED'); end if;
  perform set_config('orbit.timeline_boundary','deferred',true);
  perform pg_advisory_xact_lock(hashtextextended(req.project_id::text||':operational-assignment',0));
  roles:=case when req.responsibility='ASSEMBLY_DISASSEMBLY' then array['ASSEMBLY','DISASSEMBLY'] else array[req.responsibility] end;
  foreach role_name in array roles loop
    select required_quantity into required_count from public.event_staff_requirements where project_id=req.project_id and role=role_name;
    select count(*) into assigned_count from public.assignments where project_id=req.project_id and assignment_type=role_name and deleted_at is null and status not in('CANCELLED','REJECTED');
    if assigned_count>=coalesce(required_count,0) then raise exception 'El cupo de % ya está completo.',role_name; end if;
  end loop;
  assignment_ids:=public.assign_event_operational_responsibility(req.project_id,req.staff_id,req.responsibility,coalesce(nullif(p_reason,''),'Solicitud aprobada por Founder'));
  update public.assignments set status='CONFIRMED',accepted_at=req.requested_at,response_at=now(),updated_by=auth.uid() where id=any(assignment_ids) and deleted_at is null;
  settlement_id:=public.refresh_staff_event_payment(req.project_id,req.staff_id,auth.uid());
  if settlement_id is null then raise exception 'No fue posible crear la liquidación canónica del Evento.'; end if;
  update public.event_staff_payments set status='CONFIRMED',updated_by=auth.uid() where id=settlement_id;
  update public.staff_assignment_requests set status='CONFIRMED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason=p_reason,updated_at=now() where id=req.id;
  foreach role_name in array roles loop
    select required_quantity into required_count from public.event_staff_requirements where project_id=req.project_id and role=role_name;
    select count(*) into assigned_count from public.assignments where project_id=req.project_id and assignment_type=role_name and deleted_at is null and status not in('CANCELLED','REJECTED');
    if assigned_count<required_count then capacity_full:=false; end if;
  end loop;
  if capacity_full then update public.staff_assignment_requests set status='REJECTED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason='Cupo cubierto',updated_at=now() where project_id=req.project_id and id<>req.id and status='PENDING' and responsibility=req.responsibility; end if;
  perform public.refresh_event_operational_readiness(req.project_id,auth.uid());
  return jsonb_build_object('requestId',req.id,'status','CONFIRMED','assignmentIds',assignment_ids,'settlementId',settlement_id);
end $$;
grant execute on function public.review_staff_assignment_request(uuid,boolean,text) to authenticated;

commit;
