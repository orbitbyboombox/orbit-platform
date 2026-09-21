-- Allow one staff requirement per role at event scope and one per role/block.
-- Legacy rows (block_id IS NULL) remain untouched.
do $$
begin
  if exists (
    select 1 from public.event_staff_requirements
    where block_id is null
    group by project_id, role having count(*) > 1
  ) or exists (
    select 1 from public.event_staff_requirements
    where block_id is not null
    group by project_id, block_id, role having count(*) > 1
  ) then
    raise exception 'STAFF_REQUIREMENT_DUPLICATES_PRESENT';
  end if;
end $$;

alter table public.event_staff_requirements
  drop constraint if exists event_staff_requirements_project_id_role_key;

create unique index if not exists event_staff_requirements_event_scope_uidx
  on public.event_staff_requirements(project_id, role)
  where block_id is null;

create unique index if not exists event_staff_requirements_block_scope_uidx
  on public.event_staff_requirements(project_id, block_id, role)
  where block_id is not null;

-- Keep the existing event-level RPC semantics and make its conflict target
-- explicit for the partial unique index.
create or replace function public.set_event_staff_requirement(
  p_project_id uuid,
  p_role text,
  p_required_quantity integer,
  p_published boolean
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
  on conflict(project_id,role) where block_id is null do update
    set required_quantity=excluded.required_quantity,published=excluded.published,updated_at=now(),updated_by=auth.uid()
  returning id into result;
  return result;
end $$;

-- Block-scoped counterpart. It never updates the event-level or another block's row.
create or replace function public.set_event_staff_requirement(
  p_project_id uuid,
  p_block_id uuid,
  p_role text,
  p_required_quantity integer,
  p_published boolean
) returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid; event_status text; event_date date;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede configurar Staff.'; end if;
  if p_block_id is null then raise exception 'Bloque requerido para requisito por bloque.'; end if;
  if not exists(select 1 from public.event_operational_blocks where id=p_block_id and project_id=p_project_id) then raise exception 'Bloque operacional no encontrado.'; end if;
  if p_role not in('OPERATOR','ASSEMBLY','DISASSEMBLY') then raise exception 'Responsabilidad inválida.'; end if;
  if p_required_quantity<0 or p_required_quantity>99 then raise exception 'Cantidad requerida inválida.'; end if;
  select status,projects.event_date into event_status,event_date from public.projects where id=p_project_id and deleted_at is null;
  if event_status is null then raise exception 'Evento no encontrado.'; end if;
  if p_published and (event_status in('CANCELLED','CLOSED','COMPLETED','ARCHIVED') or event_date<timezone('America/Santiago',now())::date) then
    raise exception 'Un Evento cerrado o pasado no puede publicar requisitos.';
  end if;
  insert into public.event_staff_requirements(project_id,block_id,role,required_quantity,published,created_by,updated_by)
  values(p_project_id,p_block_id,p_role,p_required_quantity,p_published,auth.uid(),auth.uid())
  on conflict(project_id,block_id,role) where block_id is not null do update
    set required_quantity=excluded.required_quantity,published=excluded.published,updated_at=now(),updated_by=auth.uid()
  returning id into result;
  return result;
end $$;

grant execute on function public.set_event_staff_requirement(uuid,uuid,text,integer,boolean) to authenticated;
