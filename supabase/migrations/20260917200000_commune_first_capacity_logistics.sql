begin;

create or replace function public.commune_has_deterministic_logistics(p_city text)
returns boolean language sql stable security definer set search_path=public,extensions as $$
  select exists (
    select 1
    from public.commercial_prices cp
    cross join lateral jsonb_array_elements_text(coalesce(cp.rules->'municipalities','[]'::jsonb)) municipality
    where cp.category='TRANSPORT' and cp.enabled and cp.deleted_at is null
      and lower(trim(municipality))=lower(trim(coalesce(p_city,'')))
  );
$$;

create or replace function public._preflight_draft_capacity_core(
  p_service_codes text[], p_event_type text, p_event_date date,
  p_service_start timestamptz, p_service_end timestamptz,
  p_address text default '', p_city text default '', p_shell text default null
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare case_required numeric:=0; bbox_required numeric:=0; case_pool integer:=0; bbox_pool integer:=0; case_committed numeric:=0; bbox_committed numeric:=0; same_day boolean:=false; commune_deterministic boolean:=false; shell text:=nullif(upper(trim(p_shell)), '');
begin
  if p_event_date is null or p_service_start is null or p_service_end is null or p_service_end<=p_service_start then return jsonb_build_object('status','REVIEW_REQUIRED','reasonCode','OPERATIONAL_WINDOW_UNVERIFIABLE','humanSafeReason','Necesitamos validar el horario operacional.'); end if;
  select coalesce(sum(m.units_per_service) filter(where m.asset_type='CASE'),0),coalesce(sum(m.units_per_service) filter(where m.asset_type='BBOX360'),0) into case_required,bbox_required from public.service_asset_type_mappings m where m.enabled and m.service_code=any(p_service_codes) and m.asset_type in ('CASE','BBOX360');
  select count(*) filter(where asset_type='CASE' and status not in ('MAINTENANCE','OUT_OF_SERVICE')),count(*) filter(where asset_type='BBOX360' and status not in ('MAINTENANCE','OUT_OF_SERVICE')) into case_pool,bbox_pool from public.operational_assets where deleted_at is null;
  select coalesce(sum(x.case_qty),0),coalesce(sum(x.bbox_qty),0) into case_committed,bbox_committed from (select p.id,coalesce(sum(ps.quantity*m.units_per_service) filter(where m.asset_type='CASE'),0) case_qty,coalesce(sum(ps.quantity*m.units_per_service) filter(where m.asset_type='BBOX360'),0) bbox_qty from public.crm_reservations r join public.projects p on p.id=r.project_id cross join lateral public.event_operational_window(p.id) w left join public.project_services ps on ps.project_id=p.id left join public.service_asset_type_mappings m on m.service_code=ps.service_code and m.enabled and m.asset_type in ('CASE','BBOX360') where r.status='CONFIRMED' and p.deleted_at is null and w.window_start<p_service_end and p_service_start<w.window_end group by p.id) x;
  select exists(select 1 from public.crm_reservations r join public.projects p on p.id=r.project_id cross join lateral public.event_operational_window(p.id) w where r.status='CONFIRMED' and p.deleted_at is null and w.window_start::date=p_event_date) into same_day;
  commune_deterministic:=public.commune_has_deterministic_logistics(p_city);
  if case_required+case_committed>case_pool then return jsonb_build_object('status','UNAVAILABLE','reasonCode','CASE_CAPACITY_EXHAUSTED','humanSafeReason','Sin disponibilidad para este horario.'); end if;
  if bbox_required+bbox_committed>bbox_pool then return jsonb_build_object('status','UNAVAILABLE','reasonCode','BBOX360_CAPACITY_EXHAUSTED','humanSafeReason','Sin disponibilidad para este horario.'); end if;
  if case_required>0 and shell is null and upper(coalesce(p_event_type,'')) not in ('MATRIMONIO','WEDDING','MARRIAGE') then return jsonb_build_object('status','REVIEW_REQUIRED','reasonCode','SHELL_CONFIGURATION_REQUIRED','humanSafeReason','La configuración física requiere revisión de Founder.'); end if;
  if case_required>0 and upper(coalesce(p_event_type,'')) in ('MATRIMONIO','WEDDING','MARRIAGE') and shell is null then shell:='WHITE'; end if;
  if case_required>0 and not commune_deterministic then return jsonb_build_object('status','REVIEW_REQUIRED','reasonCode','TRAVEL_TIME_UNVERIFIABLE','humanSafeReason','La comuna no tiene una regla de traslado automática configurada.'); end if;
  if case_required>0 and same_day and nullif(trim(coalesce(p_city,'')),'') is null then return jsonb_build_object('status','REVIEW_REQUIRED','reasonCode','LOGISTICS_DATA_INCOMPLETE','humanSafeReason','Falta seleccionar una comuna para validar la logística.'); end if;
  return jsonb_build_object('status','AVAILABLE','reasonCode','CAPACITY_CONFIRMED','humanSafeReason','Disponibilidad confirmada para este horario.','caseCapacity',jsonb_build_object('total',case_pool,'committed',case_committed,'available',greatest(case_pool-case_committed,0)),'bboxCapacity',jsonb_build_object('total',bbox_pool,'committed',bbox_committed,'available',greatest(bbox_pool-bbox_committed,0)),'logistics',jsonb_build_object('commune',trim(p_city),'communeDeterministic',commune_deterministic,'venueOverride',nullif(trim(p_address),'')),'shell',jsonb_build_object('preferred',shell,'status',case when shell is null then 'NOT_REQUIRED' else 'OPERATIONAL_ONLY' end));
end $$;

create or replace function public.preflight_reservation_capacity(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare p public.projects%rowtype; w record; service_codes text[]; address text; shell text; result jsonb;
begin
  select * into p from public.projects where id=p_project_id and deleted_at is null;
  if not found then return jsonb_build_object('status','REVIEW_REQUIRED','reasonCode','PROJECT_NOT_FOUND','humanSafeReason','No encontramos la reserva que se debe validar.'); end if;
  select * into w from public.event_operational_window(p_project_id) limit 1;
  select coalesce(array_agg(ps.service_code), '{}'::text[]) into service_codes from public.project_services ps where ps.project_id=p_project_id;
  address:=coalesce(nullif(trim(p.operations->>'eventAddress'),''),nullif(trim(p.location),''),'');
  shell:=nullif(upper(trim(coalesce(p.operations->>'shell',p.operations->>'shellType'))),'');
  result:=public._preflight_draft_capacity_core(service_codes,p.project_type,p.event_date,w.window_start,w.window_end,address,coalesce(p.city,''),shell);
  return result;
end $$;

commit;
