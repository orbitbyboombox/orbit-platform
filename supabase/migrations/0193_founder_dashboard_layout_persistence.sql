begin;

alter table public.founder_workspace_preferences
  add column if not exists dashboard_layout_version integer not null default 1,
  add column if not exists dashboard_layout jsonb not null default '{}'::jsonb;

create or replace function public.save_founder_dashboard_layout(
  p_dashboard_layout jsonb,
  p_dashboard_layout_version integer
) returns void language plpgsql security invoker set search_path=public as $$
begin
  if auth.uid() is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede configurar el orden del dashboard.';
  end if;
  if p_dashboard_layout is null or jsonb_typeof(p_dashboard_layout) <> 'object'
    or p_dashboard_layout_version is null or p_dashboard_layout_version < 1
  then
    raise exception 'Configuración del dashboard inválida.';
  end if;

  insert into public.founder_workspace_preferences(
    user_id,
    dashboard_layout_version,
    dashboard_layout
  ) values (
    auth.uid(),
    p_dashboard_layout_version,
    p_dashboard_layout
  )
  on conflict(user_id) do update set
    dashboard_layout_version = excluded.dashboard_layout_version,
    dashboard_layout = excluded.dashboard_layout,
    updated_at = now();
end $$;

create or replace function public.reset_founder_dashboard_layout()
returns void language plpgsql security invoker set search_path=public as $$
begin
  if auth.uid() is null or not public.can_administer() then
    raise exception 'Permiso requerido.';
  end if;

  insert into public.founder_workspace_preferences(
    user_id,
    dashboard_layout_version,
    dashboard_layout
  ) values (
    auth.uid(),
    1,
    '{}'::jsonb
  )
  on conflict(user_id) do update set
    dashboard_layout_version = 1,
    dashboard_layout = '{}'::jsonb,
    updated_at = now();
end $$;

grant execute on function public.save_founder_dashboard_layout(jsonb, integer) to authenticated;
grant execute on function public.reset_founder_dashboard_layout() to authenticated;

commit;
