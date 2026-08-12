begin;

alter table public.staff add column if not exists portal_password_change_required boolean not null default false;

create or replace function public.set_staff_portal_pin(p_staff_id uuid,p_pin text,p_reason text) returns void
language plpgsql security definer set search_path=public,extensions as $$
begin
  if not public.can_administer() then raise exception 'Acceso administrativo requerido.'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'El PIN debe contener exactamente 4 números.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'La razón del cambio es obligatoria.'; end if;
  update public.staff set pin_hash=crypt(p_pin,gen_salt('bf',10)),pin_updated_at=now(),portal_password_change_required=true,approval_reason=p_reason,updated_by=auth.uid() where id=p_staff_id and deleted_at is null;
  if not found then raise exception 'Staff no encontrado.'; end if;
end $$;

create or replace function public.change_staff_portal_password(p_staff_id uuid,p_password text) returns void
language plpgsql security definer set search_path=public,extensions as $$
begin
  if length(p_password)<8 then raise exception 'La contraseña debe contener al menos 8 caracteres.'; end if;
  update public.staff set pin_hash=crypt(p_password,gen_salt('bf',10)),pin_updated_at=now(),portal_password_change_required=false where id=p_staff_id and deleted_at is null;
  if not found then raise exception 'Staff no encontrado.'; end if;
end $$;
revoke all on function public.change_staff_portal_password(uuid,text) from public,anon,authenticated;
grant execute on function public.change_staff_portal_password(uuid,text) to service_role;

create table if not exists public.staff_event_publications(
  project_id uuid primary key references public.projects(id) on delete cascade,
  published boolean not null default true,
  published_at timestamptz,
  published_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_assignment_requests(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  staff_id uuid not null references public.staff(id),
  responsibility text not null check(responsibility in('OPERATOR','ASSEMBLY','DISASSEMBLY','ASSEMBLY_DISASSEMBLY')),
  status text not null default 'PENDING' check(status in('PENDING','APPROVED','REJECTED','CANCELLED','CONFIRMED')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  review_reason text,
  updated_at timestamptz not null default now()
);
create unique index if not exists staff_assignment_requests_pending_uq on public.staff_assignment_requests(project_id,staff_id,responsibility) where status='PENDING';
create index if not exists staff_assignment_requests_project_idx on public.staff_assignment_requests(project_id,status,requested_at desc);
create index if not exists staff_assignment_requests_staff_idx on public.staff_assignment_requests(staff_id,status,requested_at desc);
alter table public.staff_event_publications enable row level security;
alter table public.staff_assignment_requests enable row level security;
create policy staff_event_publications_admin_read on public.staff_event_publications for select using(public.is_internal_user());
create policy staff_assignment_requests_admin_read on public.staff_assignment_requests for select using(public.is_internal_user());
revoke all on public.staff_event_publications,public.staff_assignment_requests from anon,authenticated;
grant select on public.staff_event_publications,public.staff_assignment_requests to authenticated;

create or replace function public.set_staff_event_publication(p_project_id uuid,p_published boolean) returns void
language plpgsql security invoker set search_path=public as $$
begin
  if not public.can_administer() then raise exception 'Solo Administración puede publicar eventos.'; end if;
  insert into public.staff_event_publications(project_id,published,published_at,published_by,updated_at)
  values(p_project_id,p_published,case when p_published then now() end,auth.uid(),now())
  on conflict(project_id) do update set published=excluded.published,published_at=case when excluded.published then now() end,published_by=auth.uid(),updated_at=now();
end $$;
grant execute on function public.set_staff_event_publication(uuid,boolean) to authenticated;

create or replace function public.request_staff_responsibility(p_staff_id uuid,p_project_id uuid,p_responsibility text) returns uuid
language plpgsql security definer set search_path=public as $$
declare roles text[]; role_name text; result uuid;
begin
  if p_responsibility not in('OPERATOR','ASSEMBLY','DISASSEMBLY','ASSEMBLY_DISASSEMBLY') then raise exception 'Responsabilidad inválida.'; end if;
  roles:=case when p_responsibility='ASSEMBLY_DISASSEMBLY' then array['ASSEMBLY','DISASSEMBLY'] else array[p_responsibility] end;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':staff-request',0));
  if not exists(select 1 from public.staff_event_publications where project_id=p_project_id and published) then raise exception 'Este evento ya no está disponible.'; end if;
  if not exists(select 1 from public.staff where id=p_staff_id and status='ACTIVE' and deleted_at is null and capabilities @> roles) then raise exception 'No tienes habilitada esta responsabilidad.'; end if;
  foreach role_name in array roles loop
    if exists(select 1 from public.assignments where project_id=p_project_id and assignment_type=role_name and deleted_at is null and status not in('CANCELLED','REJECTED')) then raise exception 'La responsabilidad ya fue asignada.'; end if;
  end loop;
  select id into result from public.staff_assignment_requests where project_id=p_project_id and staff_id=p_staff_id and responsibility=p_responsibility and status='PENDING';
  if result is null then insert into public.staff_assignment_requests(project_id,staff_id,responsibility) values(p_project_id,p_staff_id,p_responsibility) returning id into result; end if;
  return result;
end $$;
revoke all on function public.request_staff_responsibility(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.request_staff_responsibility(uuid,uuid,text) to service_role;

create or replace function public.review_staff_assignment_request(p_request_id uuid,p_approved boolean,p_reason text) returns void
language plpgsql security invoker set search_path=public as $$
declare req public.staff_assignment_requests%rowtype; occupied text[]; code text;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede revisar solicitudes.'; end if;
  select * into req from public.staff_assignment_requests where id=p_request_id for update;
  if req.id is null then raise exception 'Solicitud no encontrada.'; end if;
  if req.status<>'PENDING' then raise exception 'La solicitud ya fue revisada.'; end if;
  if not p_approved then update public.staff_assignment_requests set status='REJECTED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason=p_reason,updated_at=now() where id=req.id; return; end if;
  perform public.assign_event_operational_responsibility(req.project_id,req.staff_id,req.responsibility,coalesce(nullif(p_reason,''),'Solicitud aprobada desde Centro de Operaciones'));
  update public.staff_assignment_requests set status='APPROVED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason=p_reason,updated_at=now() where id=req.id;
  occupied:=case when req.responsibility='ASSEMBLY_DISASSEMBLY' then array['ASSEMBLY','DISASSEMBLY','ASSEMBLY_DISASSEMBLY'] when req.responsibility in('ASSEMBLY','DISASSEMBLY') then array[req.responsibility,'ASSEMBLY_DISASSEMBLY'] else array[req.responsibility] end;
  update public.staff_assignment_requests set status='REJECTED',reviewed_at=now(),reviewed_by=auth.uid(),review_reason='Responsabilidad asignada a otro colaborador',updated_at=now() where project_id=req.project_id and id<>req.id and status='PENDING' and responsibility=any(occupied);
end $$;
grant execute on function public.review_staff_assignment_request(uuid,boolean,text) to authenticated;

commit;
