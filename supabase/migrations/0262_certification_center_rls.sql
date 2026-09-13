-- Protect Certification Center metadata with the same internal role boundary
-- used by the Founder workspace.  BOOMBOX runs in its own database, so the
-- canonical tenant scope is the boombox tenant slug on every certification run.
alter table if exists public.certification_runs enable row level security;
alter table if exists public.certification_check_results enable row level security;

drop policy if exists certification_runs_admin_all on public.certification_runs;
create policy certification_runs_admin_all
  on public.certification_runs
  for all
  to authenticated
  using (public.current_orbit_role() in ('CEO','ADMINISTRATOR') and tenant_slug = 'boombox')
  with check (public.current_orbit_role() in ('CEO','ADMINISTRATOR') and tenant_slug = 'boombox');

drop policy if exists certification_results_admin_all on public.certification_check_results;
create policy certification_results_admin_all
  on public.certification_check_results
  for all
  to authenticated
  using (
    public.current_orbit_role() in ('CEO','ADMINISTRATOR')
    and exists (
      select 1
      from public.certification_runs r
      where r.id = run_id
        and r.tenant_slug = 'boombox'
    )
  )
  with check (
    public.current_orbit_role() in ('CEO','ADMINISTRATOR')
    and exists (
      select 1
      from public.certification_runs r
      where r.id = run_id
        and r.tenant_slug = 'boombox'
    )
  );
