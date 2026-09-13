begin;

-- Canonical BOOMBOX staffing baseline.  The presence of either non-operator
-- row is an explicit Founder override (including quantity 0), so defaults
-- never overwrite a deliberate configuration.
create or replace function public.resolve_boombox_default_staff_requirements(
  p_project_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.event_staff_requirements
    where project_id = p_project_id
      and role in ('ASSEMBLY', 'DISASSEMBLY')
  ) then
    return;
  end if;

  insert into public.event_staff_requirements
    (project_id, role, required_quantity, published, created_by, updated_by)
  values
    (p_project_id, 'ASSEMBLY', 1, true, auth.uid(), auth.uid()),
    (p_project_id, 'DISASSEMBLY', 1, true, auth.uid(), auth.uid())
  on conflict (project_id, role) do update set
    required_quantity = case
      when public.event_staff_requirements.required_quantity > 0
        then public.event_staff_requirements.required_quantity
      else 1
    end,
    published = true,
    updated_at = now(),
    updated_by = auth.uid();
end;
$$;

revoke all on function public.resolve_boombox_default_staff_requirements(uuid) from public, anon, authenticated;

create or replace function public.set_staff_event_publication(
  p_project_id uuid,
  p_published boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  event_status text;
  event_date date;
  published_requirements integer;
begin
  if not public.can_administer() then
    raise exception 'Solo Administración puede publicar eventos.';
  end if;

  select p.status, p.event_date
    into event_status, event_date
  from public.projects p
  where p.id = p_project_id and p.deleted_at is null;
  if event_status is null then raise exception 'Evento no encontrado.'; end if;

  if p_published then
    if event_status in ('CANCELLED','CLOSED','COMPLETED','ARCHIVED') then
      raise exception 'Un Evento cerrado no puede recibir nuevas solicitudes de Staff.';
    end if;

    if exists (
      select 1 from public.project_services ps
      where ps.project_id = p_project_id
        and ps.service_code in ('CLASSIC','POLAROID','BLACK_STUDIO','INSTABOX','BBOX360','BOOMBALL','LIGHTBOX','IA43')
    ) then
      perform public.resolve_boombox_default_staff_requirements(p_project_id);
    end if;

    insert into public.event_staff_requirements
      (project_id, role, required_quantity, published, created_by, updated_by)
    values (p_project_id, 'OPERATOR', 1, true, auth.uid(), auth.uid())
    on conflict (project_id, role) do update set
      required_quantity = case
        when public.event_staff_requirements.required_quantity > 0
          then public.event_staff_requirements.required_quantity
        else 1
      end,
      published = true,
      updated_at = now(),
      updated_by = auth.uid();

    select count(*) into published_requirements
    from public.event_staff_requirements r
    where r.project_id = p_project_id
      and r.published = true and r.required_quantity > 0;
    if coalesce(published_requirements, 0) = 0 then
      raise exception 'STAFF_REQUIREMENTS_MISSING: No hay responsabilidades configuradas para publicar este evento.';
    end if;
  end if;

  insert into public.staff_event_publications
    (project_id, published, published_at, published_by, updated_at)
  values (p_project_id, p_published, case when p_published then now() end, auth.uid(), now())
  on conflict (project_id) do update set
    published = excluded.published,
    published_at = case when excluded.published then now() end,
    published_by = auth.uid(),
    updated_at = now();
end;
$$;

revoke all on function public.set_staff_event_publication(uuid, boolean) from public, anon;
grant execute on function public.set_staff_event_publication(uuid, boolean) to authenticated;

-- Repair only published, active BOOMBOX events that still have the old
-- operator-only baseline. Existing explicit role rows are untouched.
do $$
declare item record;
begin
  for item in
    select p.id
    from public.projects p
    join public.staff_event_publications pub on pub.project_id = p.id and pub.published
    where p.deleted_at is null
      and p.event_date >= timezone('America/Santiago', now())::date
      and exists (
        select 1 from public.project_services ps
        where ps.project_id = p.id
          and ps.service_code in ('CLASSIC','POLAROID','BLACK_STUDIO','INSTABOX','BBOX360','BOOMBALL','LIGHTBOX','IA43')
      )
      and not exists (
        select 1 from public.event_staff_requirements r
        where r.project_id = p.id and r.role in ('ASSEMBLY','DISASSEMBLY')
      )
  loop
    perform public.resolve_boombox_default_staff_requirements(item.id);
  end loop;
end;
$$;

commit;
