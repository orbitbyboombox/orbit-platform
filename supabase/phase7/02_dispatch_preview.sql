-- Fase 7B. Requiere la copia aislada con la migración base de logística.
BEGIN;
ALTER TABLE orbit_tributary_preview.document DROP CONSTRAINT document_kind_check;
ALTER TABLE orbit_tributary_preview.document
  ADD CONSTRAINT document_kind_check CHECK(kind IN(33,39,52,56,61)),
  ADD COLUMN trip_id uuid,
  ADD CONSTRAINT valid_dispatch_trip CHECK((kind=52)=(trip_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS one_dispatch_per_trip
  ON orbit_tributary_preview.document(trip_id) WHERE kind=52;

CREATE FUNCTION public.orbit_tributary_dispatch_options(p_project uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM orbit_tributary_preview.assert_access();
  RETURN jsonb_build_object(
    'trips',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'label',
      concat(t.trip_type,' · ',t.origin,' → ',t.destination,' · ',v.plate,' · ',s.first_name,' ',s.last_name))
      ORDER BY t.sequence,t.id) FROM public.vehicle_trips t
      JOIN public.vehicle_profiles v ON v.asset_id=t.asset_id JOIN public.staff s ON s.id=t.driver_staff_id
      WHERE t.project_id=p_project AND t.deleted_at IS NULL AND t.status='PLANNED' AND s.deleted_at IS NULL
        AND nullif(trim(s.rut),'') IS NOT NULL AND nullif(trim(v.plate),'') IS NOT NULL),'[]'::jsonb),
    'assets',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'label',a.asset_code) ORDER BY a.asset_code)
      FROM public.operational_assets a WHERE a.deleted_at IS NULL AND a.asset_type::text<>'VEHICLE'
        AND EXISTS(SELECT 1 FROM public.asset_assignments x WHERE x.project_id=p_project AND x.asset_id=a.id
          AND x.deleted_at IS NULL AND x.returned_at IS NULL AND x.assignment_status::text NOT IN('CANCELLED','RELEASED','RETURNED'))),'[]'::jsonb));
END;
$$;

CREATE FUNCTION public.orbit_tributary_dispatch_draft(p_project uuid,p_trip uuid,p_assets uuid[],
  p_receiver_name text,p_receiver_rut text,p_city text,p_carrier_rut text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_trip jsonb;
  v_assets jsonb;
  v_customer uuid;
  v_id bigint;
  v_snapshot jsonb;
BEGIN
  PERFORM orbit_tributary_preview.assert_access();
  IF coalesce(cardinality(p_assets),0) NOT BETWEEN 1 AND 40 OR nullif(trim(p_receiver_name),'') IS NULL
    OR length(p_receiver_name)>100 OR coalesce(p_receiver_rut,'') !~ '^[0-9]{7,8}-[0-9K]$'
    OR coalesce(p_carrier_rut,'') !~ '^[0-9]{7,8}-[0-9K]$'
    OR nullif(trim(p_city),'') IS NULL OR length(p_city)>20 THEN
    RAISE EXCEPTION 'Ingresar destinatario, transportista, comuna y equipamiento válidos';
  END IF;
  SELECT p.customer_id INTO v_customer FROM public.projects p WHERE p.id=p_project
    AND p.deleted_at IS NULL AND p.status::text NOT IN('CANCELLED','ARCHIVED');
  SELECT jsonb_build_object('trip',t.id,'plate',trim(v.plate),'driverName',concat_ws(' ',s.first_name,s.last_name),
    'driverRut',s.rut,'address',t.destination,'origin',t.origin,'city',trim(p_city),
    'carrierRut',p_carrier_rut,'asset',t.asset_id,'staff',s.id,'departure',t.planned_start_at)
  INTO v_trip FROM public.vehicle_trips t
  JOIN public.operational_assets vehicle ON vehicle.id=t.asset_id AND vehicle.deleted_at IS NULL
  JOIN public.vehicle_profiles v ON v.asset_id=t.asset_id
  JOIN public.staff s ON s.id=t.driver_staff_id
  WHERE t.id=p_trip AND t.project_id=p_project AND t.deleted_at IS NULL AND t.status='PLANNED'
    AND s.deleted_at IS NULL AND nullif(trim(s.rut),'') IS NOT NULL AND nullif(trim(v.plate),'') IS NOT NULL
    AND length(trim(t.destination)) BETWEEN 1 AND 70;
  IF v_customer IS NULL OR v_trip IS NULL THEN
    RAISE EXCEPTION 'El traslado requiere evento, vehículo, patente, chofer registrado y destino';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.asset_code,'quantity',1) ORDER BY a.id)
  INTO v_assets FROM public.operational_assets a
  WHERE a.id=ANY(p_assets) AND a.deleted_at IS NULL AND a.asset_type::text<>'VEHICLE'
    AND EXISTS(SELECT 1 FROM public.asset_assignments x WHERE x.project_id=p_project AND x.asset_id=a.id
      AND x.deleted_at IS NULL AND x.returned_at IS NULL AND x.assignment_status::text NOT IN('CANCELLED','RELEASED','RETURNED'));
  IF coalesce(jsonb_array_length(v_assets),0)<>cardinality(p_assets) THEN
    RAISE EXCEPTION 'Equipo duplicado o no asignado al evento';
  END IF;
  v_snapshot=jsonb_build_object('dispatch',v_trip,'equipment',v_assets,
    'receiver',jsonb_build_object('name',trim(p_receiver_name),'rut',p_receiver_rut));
  INSERT INTO orbit_tributary_preview.document(project_id,customer_id,kind,trip_id,snapshot)
  VALUES(p_project,v_customer,52,p_trip,v_snapshot)
  ON CONFLICT(trip_id) WHERE kind=52 DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM orbit_tributary_preview.document
      WHERE trip_id=p_trip AND project_id=p_project AND kind=52 AND snapshot=v_snapshot;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Ya existe una guía para este traslado con otros datos'; END IF;
  ELSE
    INSERT INTO orbit_tributary_preview.audit(document_id,actor,action) VALUES(v_id,auth.uid(),'BORRADOR GUÍA');
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.orbit_tributary_dispatch_options(uuid),
  public.orbit_tributary_dispatch_draft(uuid,uuid,uuid[],text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tributary_dispatch_options(uuid),
  public.orbit_tributary_dispatch_draft(uuid,uuid,uuid[],text,text,text,text) TO authenticated;
COMMIT;
