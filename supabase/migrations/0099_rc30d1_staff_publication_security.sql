-- RC-30D.1 · Allow the audited administrative RPC to write through RLS.
-- The function itself retains the Founder/Administrator authorization check.
create or replace function public.set_staff_event_publication(p_project_id uuid,p_published boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.can_administer() then raise exception 'Solo Administración puede publicar eventos.'; end if;
  if not exists(select 1 from public.projects where id=p_project_id and deleted_at is null) then raise exception 'Evento no encontrado.'; end if;
  insert into public.staff_event_publications(project_id,published,published_at,published_by,updated_at)
  values(p_project_id,p_published,case when p_published then now() end,auth.uid(),now())
  on conflict(project_id) do update set
    published=excluded.published,
    published_at=case when excluded.published then now() end,
    published_by=auth.uid(),
    updated_at=now();
end $$;

revoke all on function public.set_staff_event_publication(uuid,boolean) from public,anon;
grant execute on function public.set_staff_event_publication(uuid,boolean) to authenticated;
