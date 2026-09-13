begin;

-- Keep Staff publication and its operational demand atomic.  The established
-- default for an operational event is one OPERATOR; any additional roles remain
-- explicit Founder configuration in event_staff_requirements.
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
  where p.id = p_project_id
    and p.deleted_at is null;

  if event_status is null then
    raise exception 'Evento no encontrado.';
  end if;

  if p_published then
    if event_status in ('CANCELLED','CLOSED','COMPLETED','ARCHIVED') then
      raise exception 'Un Evento cerrado no puede recibir nuevas solicitudes de Staff.';
    end if;

    -- OPERATOR x1 is the existing canonical baseline seeded by 0129.  Repair
    -- legacy rows that were left unpublished, without inventing other roles.
    insert into public.event_staff_requirements(
      project_id, role, required_quantity, published, created_by, updated_by
    ) values (
      p_project_id, 'OPERATOR', 1, true, auth.uid(), auth.uid()
    )
    on conflict (project_id, role) do update set
      required_quantity = case
        when public.event_staff_requirements.required_quantity > 0
          then public.event_staff_requirements.required_quantity
        else 1
      end,
      published = true,
      updated_at = now(),
      updated_by = auth.uid();

    select count(*)
      into published_requirements
    from public.event_staff_requirements r
    where r.project_id = p_project_id
      and r.published = true
      and r.required_quantity > 0;

    if coalesce(published_requirements, 0) = 0 then
      raise exception 'STAFF_REQUIREMENTS_MISSING: No hay responsabilidades configuradas para publicar este evento.';
    end if;
  end if;

  insert into public.staff_event_publications(
    project_id, published, published_at, published_by, updated_at
  ) values (
    p_project_id,
    p_published,
    case when p_published then now() end,
    auth.uid(),
    now()
  )
  on conflict (project_id) do update set
    published = excluded.published,
    published_at = case when excluded.published then now() end,
    published_by = auth.uid(),
    updated_at = now();
end;
$$;

revoke all on function public.set_staff_event_publication(uuid, boolean) from public, anon;
grant execute on function public.set_staff_event_publication(uuid, boolean) to authenticated;

-- Repair only the four already published legacy events when their canonical
-- baseline requirement exists. No assignments, reservations, or payments are
-- created by this migration.
insert into public.event_staff_requirements(
  project_id, role, required_quantity, published
)
select p.id, 'OPERATOR', 1, true
from public.projects p
join public.staff_event_publications pub
  on pub.project_id = p.id and pub.published = true
where p.orbit_event_id in (
  'ORB-2026-118136',
  'ORB-2026-055849',
  'ORB-2026-660132',
  'ORB-2026-307380'
)
  and p.deleted_at is null
on conflict (project_id, role) do update set
  required_quantity = case
    when public.event_staff_requirements.required_quantity > 0
      then public.event_staff_requirements.required_quantity
    else 1
  end,
  published = true,
  updated_at = now();

commit;
