-- Phase 3: physical inventory reconciliation and commercial capacity gate.
-- Additive, idempotent and non-destructive. No customer, reservation or payment
-- records are deleted or rewritten by this migration.
begin;

-- Founder-confirmed shell inventory. The rows remain auditable; only phantom
-- stock is made non-sellable through the existing OUT_OF_SERVICE status.
do $$
declare item record; previous text; correlation text;
begin
  for item in select id,asset_code,status from public.operational_assets
    where asset_code in ('WHITE-09','WHITE-10','WHITE-11','WHITE-12','BLACK-11','BLACK-12')
      and deleted_at is null loop
    previous:=item.status;
    if previous <> 'OUT_OF_SERVICE' then
      update public.operational_assets set status='OUT_OF_SERVICE',updated_at=now() where id=item.id;
    end if;
    correlation:='resource-reconcile:phase3:'||item.asset_code||':phantom';
    insert into public.asset_history(asset_id,history_type,message,previous_state,new_state,correlation_id)
    select item.id,'STATUS_CHANGE',item.asset_code||' excluido del stock físico confirmado por Founder (WHITE 8 / BLACK 10).',
      jsonb_build_object('status',previous),jsonb_build_object('status','OUT_OF_SERVICE'),correlation
    where not exists(select 1 from public.asset_history where correlation_id=correlation);
  end loop;
  -- Two historical rows had a stale status despite having no active assignment.
  for item in select id,asset_code,status from public.operational_assets
    where asset_code in ('WHITE-01','WHITE-06') and deleted_at is null loop
    if not exists(select 1 from public.asset_assignments a where a.asset_id=item.id and a.assignment_status='ASSIGNED' and a.deleted_at is null)
       and item.status='ASSIGNED' then
      update public.operational_assets set status='AVAILABLE',updated_at=now() where id=item.id;
      correlation:='resource-reconcile:phase3:'||item.asset_code||':available';
      insert into public.asset_history(asset_id,history_type,message,previous_state,new_state,correlation_id)
      select item.id,'STATUS_CHANGE',item.asset_code||' disponible: no existe asignación física activa.',
        jsonb_build_object('status','ASSIGNED'),jsonb_build_object('status','AVAILABLE'),correlation
      where not exists(select 1 from public.asset_history where correlation_id=correlation);
    end if;
  end loop;
end $$;

alter table public.project_operational_contracts add column if not exists shell_type text;
alter table public.project_operational_contracts add column if not exists shell_selection_source text;
alter table public.project_operational_contracts drop constraint if exists project_operational_contracts_shell_type_check;
alter table public.project_operational_contracts add constraint project_operational_contracts_shell_type_check
  check (shell_type is null or shell_type in ('WHITE','BLACK'));
alter table public.project_operational_contracts drop constraint if exists project_operational_contracts_shell_source_check;
alter table public.project_operational_contracts add constraint project_operational_contracts_shell_source_check
  check (shell_selection_source is null or shell_selection_source in ('FOUNDER','MARRIAGE_DEFAULT','QR_REQUIREMENT'));
create index if not exists project_operational_contracts_shell_idx
  on public.project_operational_contracts(shell_type) where shell_type is not null;

-- Resolve shell configuration without guessing non-marriage events. A QR
-- requirement is a canonical WHITE constraint; CASE remains the sole technical
-- kit requirement and is never double-counted with camera/printer/touch.
create or replace function public.resolve_event_shell_configuration(p_project_id uuid)
returns table(shell_type text, required boolean, source text, verifiable boolean)
language sql stable security definer set search_path=public as $$
  with project as (
    select p.id,p.project_type,c.shell_type,c.shell_selection_source,
      exists(select 1 from public.project_services ps
        where ps.project_id=p.id and ps.service_code in ('CLASSIC','POLAROID','BLACK_STUDIO','INSTABOX')) as uses_case,
      exists(select 1 from public.project_services ps
        where ps.project_id=p.id and (ps.extras::text ilike '%QR%' or ps.extras::text ilike '%qr%')) as qr_requested
    from public.projects p left join public.project_operational_contracts c on c.project_id=p.id
    where p.id=p_project_id and p.deleted_at is null
  )
  select case when qr_requested then 'WHITE' else coalesce(shell_type,case when upper(coalesce(project_type,'')) in ('WEDDING','MATRIMONIO','MARRIAGE') then 'WHITE' end) end,
    uses_case,
    case when qr_requested then 'QR_REQUIREMENT' when shell_type is not null then coalesce(shell_selection_source,'FOUNDER')
      when upper(coalesce(project_type,'')) in ('WEDDING','MATRIMONIO','MARRIAGE') then 'MARRIAGE_DEFAULT' end,
    (not uses_case) or qr_requested or shell_type is not null or upper(coalesce(project_type,'')) in ('WEDDING','MATRIMONIO','MARRIAGE')
  from project;
$$;
revoke all on function public.resolve_event_shell_configuration(uuid) from public,anon;
grant execute on function public.resolve_event_shell_configuration(uuid) to authenticated,service_role;

-- Founder/Admin/Operations shell selection persists on the existing operational
-- contract. It deliberately does not alter pricing, quotations or reservations.
create or replace function public.set_event_shell_configuration(p_project_id uuid,p_shell_type text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); normalized text:=nullif(upper(trim(p_shell_type)), '');
begin
  if actor is null or public.current_orbit_role() not in ('CEO','ADMINISTRATOR','OPERATIONS') then raise exception 'Permiso operacional requerido.'; end if;
  if normalized is not null and normalized not in ('WHITE','BLACK') then raise exception 'Carcasa inválida.'; end if;
  update public.project_operational_contracts set shell_type=normalized,shell_selection_source=case when normalized is null then null else 'FOUNDER' end,updated_by=actor where project_id=p_project_id;
  if not found then raise exception 'Contrato operacional no preparado.'; end if;
  return jsonb_build_object('projectId',p_project_id,'shellType',normalized);
end $$;
revoke all on function public.set_event_shell_configuration(uuid,text) from public,anon;
grant execute on function public.set_event_shell_configuration(uuid,text) to authenticated,service_role;

-- Capacity preflight for the canonical reservation confirmation boundary.
-- It counts overlapping confirmed projects, not calendar dates and not merely
-- physical assignment rows. Unknown shell selections are reported for Founder
-- review rather than guessed into WHITE or BLACK.
create or replace function public.preflight_reservation_capacity(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare candidate_start timestamptz; candidate_end timestamptz; candidate_case numeric:=0; candidate_shell text; candidate_shell_required boolean:=false;
  case_pool integer; white_pool integer; black_pool integer; case_committed numeric:=0; white_committed numeric:=0; black_committed numeric:=0; unresolved integer:=0; row record;
begin
  select w.window_start,w.window_end into candidate_start,candidate_end from public.event_operational_window(p_project_id) w limit 1;
  if candidate_start is null or candidate_end is null or candidate_end<=candidate_start then
    return jsonb_build_object('status','REVIEW','reason','OPERATIONAL_WINDOW_UNVERIFIABLE','projectId',p_project_id);
  end if;
  select coalesce(sum(ps.quantity*map.units_per_service),0) into candidate_case
    from public.project_services ps join public.service_asset_type_mappings map on map.service_code=ps.service_code and map.asset_type='CASE' and map.enabled
    where ps.project_id=p_project_id;
  select r.shell_type,r.required into candidate_shell,candidate_shell_required from public.resolve_event_shell_configuration(p_project_id) r;
  select count(*) filter(where asset_type='CASE' and status not in ('MAINTENANCE','OUT_OF_SERVICE')),
         count(*) filter(where asset_type='TOTEM' and asset_code like 'WHITE-%' and status not in ('MAINTENANCE','OUT_OF_SERVICE')),
         count(*) filter(where asset_type='TOTEM' and asset_code like 'BLACK-%' and status not in ('MAINTENANCE','OUT_OF_SERVICE'))
    into case_pool,white_pool,black_pool from public.operational_assets where deleted_at is null;
  for row in
    select p.id,coalesce(sum(ps.quantity*map.units_per_service),0) as case_qty,
      (select s.shell_type from public.resolve_event_shell_configuration(p.id) s) as shell_type,
      (select s.required from public.resolve_event_shell_configuration(p.id) s) as shell_required
    from public.crm_reservations res join public.projects p on p.id=res.project_id
      cross join lateral public.event_operational_window(p.id) w
      left join public.project_services ps on ps.project_id=p.id
      left join public.service_asset_type_mappings map on map.service_code=ps.service_code and map.asset_type='CASE' and map.enabled
    where res.status='CONFIRMED' and p.deleted_at is null and res.project_id<>p_project_id
      and w.window_start < candidate_end and candidate_start < w.window_end
    group by p.id
  loop
    case_committed:=case_committed+coalesce(row.case_qty,0);
    if row.case_qty>0 then
      if row.shell_type='WHITE' then white_committed:=white_committed+row.case_qty;
      elsif row.shell_type='BLACK' then black_committed:=black_committed+row.case_qty;
      elsif row.shell_required then unresolved:=unresolved+1;
      end if;
    end if;
  end loop;
  if candidate_case>0 and candidate_shell_required and candidate_shell is null then
    return jsonb_build_object('status','REVIEW','reason','SHELL_CONFIGURATION_REQUIRED','caseRequired',candidate_case,'caseAvailable',case_pool-case_committed,'unresolvedConfirmed',unresolved);
  end if;
  if candidate_case+case_committed>case_pool then
    return jsonb_build_object('status','BLOCKED','reason','CASE_CAPACITY_EXCEEDED','caseRequired',candidate_case,'caseCommitted',case_committed,'caseCapacity',case_pool);
  end if;
  if candidate_shell='WHITE' and candidate_case+white_committed>white_pool then
    return jsonb_build_object('status','BLOCKED','reason','WHITE_SHELL_CAPACITY_EXCEEDED','required',candidate_case,'committed',white_committed,'capacity',white_pool);
  end if;
  if candidate_shell='BLACK' and candidate_case+black_committed>black_pool then
    return jsonb_build_object('status','BLOCKED','reason','BLACK_SHELL_CAPACITY_EXCEEDED','required',candidate_case,'committed',black_committed,'capacity',black_pool);
  end if;
  return jsonb_build_object('status','PASS','caseRequired',candidate_case,'caseCommitted',case_committed,'caseCapacity',case_pool,
    'whiteCommitted',white_committed,'whiteCapacity',white_pool,'blackCommitted',black_committed,'blackCapacity',black_pool,'unresolvedConfirmed',unresolved);
end $$;
revoke all on function public.preflight_reservation_capacity(uuid) from public,anon;
grant execute on function public.preflight_reservation_capacity(uuid) to authenticated,service_role;

create or replace function public.enforce_reservation_capacity_gate() returns trigger
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if new.status='CONFIRMED' and coalesce(old.status,'')<>'CONFIRMED' then
    result:=public.preflight_reservation_capacity(new.project_id);
    if result->>'status'='BLOCKED' then raise exception 'Reserva bloqueada por capacidad operativa: %',result->>'reason' using errcode='P0001',detail=result::text; end if;
  end if;
  return new;
end $$;
drop trigger if exists crm_reservations_capacity_gate on public.crm_reservations;
create trigger crm_reservations_capacity_gate before update of status on public.crm_reservations
  for each row execute function public.enforce_reservation_capacity_gate();

commit;
