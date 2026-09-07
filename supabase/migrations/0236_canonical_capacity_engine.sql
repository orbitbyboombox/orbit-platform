-- Final canonical capacity engine. CASE/BBOX360 are hard pools; shell and
-- logistics uncertainty are review signals, never false availability.
begin;

create or replace function public.preflight_reservation_capacity(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare candidate_start timestamptz; candidate_end timestamptz; candidate_case numeric:=0; candidate_bbox numeric:=0; candidate_shell text; candidate_shell_required boolean:=false;
  case_pool integer:=0; bbox_pool integer:=0; white_pool integer:=0; black_pool integer:=0; case_committed numeric:=0; bbox_committed numeric:=0; white_committed numeric:=0; black_committed numeric:=0; unresolved integer:=0; same_day_commitment boolean:=false; candidate_address text; candidate_city text; row record;
begin
  select w.window_start,w.window_end into candidate_start,candidate_end from public.event_operational_window(p_project_id) w limit 1;
  select coalesce(nullif(trim(coalesce((p.operations->>'eventAddress'),p.location)),''),''),coalesce(nullif(trim(p.city),''),'') into candidate_address,candidate_city from public.projects p where p.id=p_project_id and p.deleted_at is null;
  if candidate_start is null or candidate_end is null or candidate_end<=candidate_start then
    return jsonb_build_object('status','REVIEW_REQUIRED','reasonCode','OPERATIONAL_WINDOW_UNVERIFIABLE','humanSafeReason','Necesitamos validar el horario operacional.','requestedWindow',jsonb_build_object('start',candidate_start,'end',candidate_end));
  end if;
  select coalesce(sum(ps.quantity*map.units_per_service) filter(where map.asset_type='CASE'),0),coalesce(sum(ps.quantity*map.units_per_service) filter(where map.asset_type='BBOX360'),0)
    into candidate_case,candidate_bbox from public.project_services ps join public.service_asset_type_mappings map on map.service_code=ps.service_code and map.enabled and map.asset_type in ('CASE','BBOX360') where ps.project_id=p_project_id;
  select r.shell_type,r.required into candidate_shell,candidate_shell_required from public.resolve_event_shell_configuration(p_project_id) r;
  select count(*) filter(where asset_type='CASE' and status not in ('MAINTENANCE','OUT_OF_SERVICE')),count(*) filter(where asset_type='BBOX360' and status not in ('MAINTENANCE','OUT_OF_SERVICE')),
    count(*) filter(where asset_type='TOTEM' and asset_code like 'WHITE-%' and status not in ('MAINTENANCE','OUT_OF_SERVICE')),count(*) filter(where asset_type='TOTEM' and asset_code like 'BLACK-%' and status not in ('MAINTENANCE','OUT_OF_SERVICE'))
    into case_pool,bbox_pool,white_pool,black_pool from public.operational_assets where deleted_at is null;
  for row in
    select p.id,coalesce(sum(ps.quantity*map.units_per_service) filter(where map.asset_type='CASE'),0) case_qty,coalesce(sum(ps.quantity*map.units_per_service) filter(where map.asset_type='BBOX360'),0) bbox_qty,
      (select s.shell_type from public.resolve_event_shell_configuration(p.id) s) shell_type,(select s.required from public.resolve_event_shell_configuration(p.id) s) shell_required
    from public.crm_reservations res join public.projects p on p.id=res.project_id cross join lateral public.event_operational_window(p.id) w
      left join public.project_services ps on ps.project_id=p.id left join public.service_asset_type_mappings map on map.service_code=ps.service_code and map.enabled and map.asset_type in ('CASE','BBOX360')
    where res.status='CONFIRMED' and p.deleted_at is null and res.project_id<>p_project_id and w.window_start < candidate_end and candidate_start < w.window_end group by p.id
  loop
    case_committed:=case_committed+coalesce(row.case_qty,0); bbox_committed:=bbox_committed+coalesce(row.bbox_qty,0);
    if row.case_qty>0 then
      if row.shell_type='WHITE' then white_committed:=white_committed+row.case_qty; elsif row.shell_type='BLACK' then black_committed:=black_committed+row.case_qty; elsif row.shell_required then unresolved:=unresolved+1; end if;
    end if;
  end loop;
  -- Same-day reuse needs a real route/turnaround source. ORBIT currently has
  -- no canonical routing provider, so do not claim availability when a prior
  -- committed CASE event exists on the same local date.
  select exists(select 1 from public.crm_reservations res join public.projects p on p.id=res.project_id cross join lateral public.event_operational_window(p.id) w
    where res.status='CONFIRMED' and p.deleted_at is null and res.project_id<>p_project_id and w.window_start::date=candidate_start::date) into same_day_commitment;
  if candidate_case+case_committed>case_pool then
    return jsonb_build_object('status','UNAVAILABLE','reasonCode','CASE_CAPACITY_EXHAUSTED','humanSafeReason','Sin disponibilidad para este horario.','caseCapacity',jsonb_build_object('total',case_pool,'committed',case_committed,'available',greatest(case_pool-case_committed,0)),'requestedWindow',jsonb_build_object('start',candidate_start,'end',candidate_end));
  end if;
  if candidate_bbox+bbox_committed>bbox_pool then
    return jsonb_build_object('status','UNAVAILABLE','reasonCode','BBOX360_CAPACITY_EXHAUSTED','humanSafeReason','Sin disponibilidad para este horario.','requiredResources',jsonb_build_object('BBOX360',candidate_bbox),'bboxCapacity',jsonb_build_object('total',bbox_pool,'committed',bbox_committed,'available',greatest(bbox_pool-bbox_committed,0)));
  end if;
  if candidate_case>0 and candidate_shell_required and candidate_shell is null then
    return jsonb_build_object('status','REVIEW_REQUIRED','reasonCode','SHELL_CONFIGURATION_REQUIRED','humanSafeReason','La configuración física requiere revisión de Founder.','caseCapacity',jsonb_build_object('total',case_pool,'committed',case_committed,'available',greatest(case_pool-case_committed,0)),'shell',jsonb_build_object('preferred',null,'status','REVIEW'));
  end if;
  if candidate_case>0 and same_day_commitment and (candidate_address='' or candidate_city='') then
    return jsonb_build_object('status','REVIEW_REQUIRED','reasonCode','LOGISTICS_DATA_INCOMPLETE','humanSafeReason','Falta validar ubicación y logística para reutilizar el equipo.','logistics',jsonb_build_object('status','REVIEW_REQUIRED','reason','ADDRESS_OR_CITY_MISSING'));
  end if;
  if candidate_case>0 and same_day_commitment then
    return jsonb_build_object('status','REVIEW_REQUIRED','reasonCode','TRAVEL_TIME_UNVERIFIABLE','humanSafeReason','El tiempo de traslado entre eventos requiere revisión de Founder.','logistics',jsonb_build_object('status','REVIEW_REQUIRED','reason','ROUTING_PROVIDER_NOT_CONFIGURED'));
  end if;
  return jsonb_build_object('status','AVAILABLE','reasonCode','CAPACITY_CONFIRMED','humanSafeReason','Disponibilidad confirmada para este horario.','requestedWindow',jsonb_build_object('start',candidate_start,'end',candidate_end),
    'requiredResources',jsonb_build_object('CASE',candidate_case,'BBOX360',candidate_bbox),'caseCapacity',jsonb_build_object('total',case_pool,'committed',case_committed,'available',greatest(case_pool-case_committed,0)),
    'bboxCapacity',jsonb_build_object('total',bbox_pool,'committed',bbox_committed,'available',greatest(bbox_pool-bbox_committed,0)),
    'shell',jsonb_build_object('preferred',candidate_shell,'status',case when candidate_shell is null then 'NOT_REQUIRED' else 'PLANNED' end,'whiteCommitted',white_committed,'whiteCapacity',white_pool,'blackCommitted',black_committed,'blackCapacity',black_pool));
end $$;

create or replace function public.get_event_capacity(p_project_id uuid) returns jsonb language sql stable security definer set search_path=public as $$ select public.preflight_reservation_capacity(p_project_id) $$;
revoke all on function public.get_event_capacity(uuid) from public,anon;
grant execute on function public.get_event_capacity(uuid) to authenticated,service_role;

-- Capacity exhaustion is a hard stop. REVIEW_REQUIRED is surfaced by the
-- canonical function for Founder resolution and is not silently presented as
-- available by future channels.
create or replace function public.enforce_reservation_capacity_gate() returns trigger
language plpgsql security definer set search_path=public as $$ declare result jsonb; begin
  if new.status='CONFIRMED' and coalesce(old.status,'')<>'CONFIRMED' then
    result:=public.preflight_reservation_capacity(new.project_id);
    if result->>'status'='UNAVAILABLE' then raise exception 'Reserva bloqueada por capacidad operativa: %',result->>'reasonCode' using errcode='P0001',detail=result::text; end if;
    if result->>'status'='REVIEW_REQUIRED' then raise exception 'Reserva requiere revisión de capacidad: %',result->>'reasonCode' using errcode='P0001',detail=result::text; end if;
  end if;
  return new;
end $$;

commit;
