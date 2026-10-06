begin;

-- An operational block is one operator turn, while the project remains one
-- event. The existing event_staff_requirements table is the canonical scope
-- for those slots; no parallel assignment model is introduced.
create or replace function public.ensure_event_operational_block_staff_requirements(
  p_project_id uuid,
  p_published boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  block record;
begin
  for block in
    select id
    from public.event_operational_blocks
    where project_id = p_project_id
    order by sequence
  loop
    insert into public.event_staff_requirements(
      project_id, block_id, role, required_quantity, published, created_by, updated_by
    ) values (
      p_project_id, block.id, 'OPERATOR', 1, coalesce(p_published, false), actor, actor
    )
    on conflict (project_id, block_id, role) where block_id is not null do update
      set required_quantity = greatest(public.event_staff_requirements.required_quantity, 1),
          published = case when p_published then true else public.event_staff_requirements.published end,
          updated_at = now(),
          updated_by = actor;
  end loop;
end;
$$;

revoke all on function public.ensure_event_operational_block_staff_requirements(uuid, boolean) from public, anon, authenticated;

create or replace function public.sync_event_operational_block_operator_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  published boolean;
begin
  select coalesce(published, false)
    into published
  from public.staff_event_publications
  where project_id = new.project_id;

  perform public.ensure_event_operational_block_staff_requirements(new.project_id, published);
  return new;
end;
$$;

drop trigger if exists event_operational_block_operator_slot on public.event_operational_blocks;
create trigger event_operational_block_operator_slot
after insert on public.event_operational_blocks
for each row execute function public.sync_event_operational_block_operator_slot();

-- Make existing blocks visible as operator turns without creating assignments.
do $$
declare item record;
begin
  for item in select distinct project_id from public.event_operational_blocks loop
    perform public.ensure_event_operational_block_staff_requirements(
      item.project_id,
      exists (
        select 1 from public.staff_event_publications
        where project_id = item.project_id and published
      )
    );
  end loop;
end;
$$;

-- Publishing remains the existing atomic publication action. For segmented
-- events it publishes one OPERATOR requirement per block; legacy events keep
-- their event-level OPERATOR requirement unchanged.
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
  block_count integer;
  published_requirements integer;
begin
  if not public.can_administer() then
    raise exception 'Solo Administración puede publicar eventos.';
  end if;

  select p.status into event_status
  from public.projects p
  where p.id = p_project_id and p.deleted_at is null;
  if event_status is null then raise exception 'Evento no encontrado.'; end if;

  if p_published then
    if event_status in ('CANCELLED','CLOSED','COMPLETED','ARCHIVED') then
      raise exception 'Un Evento cerrado no puede recibir nuevas solicitudes de Staff.';
    end if;

    select count(*) into block_count
    from public.event_operational_blocks
    where project_id = p_project_id;

    if block_count > 0 then
      perform public.ensure_event_operational_block_staff_requirements(p_project_id, true);
    else
      if exists (
        select 1 from public.project_services ps
        where ps.project_id = p_project_id
          and ps.service_code in ('CLASSIC','POLAROID','BLACK_STUDIO','INSTABOX','BBOX360','BOOMBALL','LIGHTBOX','IA43')
      ) then
        perform public.resolve_boombox_default_staff_requirements(p_project_id);
      end if;

      insert into public.event_staff_requirements(
        project_id, role, required_quantity, published, created_by, updated_by
      ) values (p_project_id, 'OPERATOR', 1, true, auth.uid(), auth.uid())
      on conflict (project_id, role) where block_id is null do update
        set required_quantity = case when public.event_staff_requirements.required_quantity > 0
          then public.event_staff_requirements.required_quantity else 1 end,
            published = true, updated_at = now(), updated_by = auth.uid();
    end if;

    select count(*) into published_requirements
    from public.event_staff_requirements r
    where r.project_id = p_project_id and r.published and r.required_quantity > 0;
    if coalesce(published_requirements, 0) = 0 then
      raise exception 'STAFF_REQUIREMENTS_MISSING: No hay responsabilidades configuradas para publicar este evento.';
    end if;
  end if;

  insert into public.staff_event_publications(
    project_id, published, published_at, published_by, updated_at
  ) values (
    p_project_id, p_published, case when p_published then now() end, auth.uid(), now()
  ) on conflict (project_id) do update set
    published = excluded.published,
    published_at = case when excluded.published then now() end,
    published_by = auth.uid(),
    updated_at = now();
end;
$$;

revoke all on function public.set_staff_event_publication(uuid, boolean) from public, anon;
grant execute on function public.set_staff_event_publication(uuid, boolean) to authenticated;

commit;
