-- Aplicar exclusivamente en una copia aislada. El interruptor se crea apagado.
BEGIN;
CREATE SCHEMA orbit_tributary_preview;
REVOKE ALL ON SCHEMA orbit_tributary_preview FROM PUBLIC;
CREATE TABLE orbit_tributary_preview.settings (
  singleton boolean PRIMARY KEY CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO orbit_tributary_preview.settings(singleton) VALUES(true);
CREATE TABLE orbit_tributary_preview.document (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  kind int NOT NULL CHECK(kind IN(33,39,56,61)),
  parent_id bigint REFERENCES orbit_tributary_preview.document(id),
  snapshot jsonb NOT NULL,
  state text NOT NULL DEFAULT 'BORRADOR' CHECK(state IN('BORRADOR','APROBADO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind IN(56,61)) = (parent_id IS NOT NULL))
);
CREATE UNIQUE INDEX one_sale ON orbit_tributary_preview.document(project_id) WHERE kind IN(33,39);
CREATE UNIQUE INDEX one_note ON orbit_tributary_preview.document(parent_id,kind) WHERE kind IN(56,61);
CREATE INDEX documents_by_customer ON orbit_tributary_preview.document(customer_id, id DESC);
CREATE TABLE orbit_tributary_preview.audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES orbit_tributary_preview.document(id),
  actor uuid NOT NULL,
  action text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE orbit_tributary_preview.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_tributary_preview.document ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_tributary_preview.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA orbit_tributary_preview FROM PUBLIC, authenticated, anon;

CREATE FUNCTION orbit_tributary_preview.assert_access() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orbit_tributary_preview.settings WHERE enabled)
     OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role::text IN('CEO','ADMINISTRATOR')) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Acceso tributario no disponible';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION orbit_tributary_preview.assert_access() FROM PUBLIC;

CREATE FUNCTION public.orbit_tributary_list(p_project uuid DEFAULT NULL,p_customer uuid DEFAULT NULL)
RETURNS TABLE(id bigint,project_id uuid,kind integer,state text,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM orbit_tributary_preview.assert_access();
  RETURN QUERY SELECT d.id,d.project_id,d.kind,d.state,d.created_at
  FROM orbit_tributary_preview.document d
  WHERE (p_project IS NULL OR d.project_id=p_project) AND (p_customer IS NULL OR d.customer_id=p_customer)
  ORDER BY d.id DESC LIMIT 100;
END;
$$;

CREATE FUNCTION public.orbit_tributary_draft(p_project uuid,p_kind integer)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_customer uuid;
  v_origin jsonb;
  v_document bigint;
BEGIN
  PERFORM orbit_tributary_preview.assert_access();
  IF p_kind IS NULL OR p_kind NOT IN(33,39) THEN
    RAISE EXCEPTION 'Tipo no disponible para una venta';
  END IF;
  SELECT p.customer_id,to_jsonb(o)
    INTO v_customer,v_origin
    FROM public.projects p JOIN public.project_commercial_origins o ON o.project_id=p.id
    WHERE p.id=p_project AND p.deleted_at IS NULL
      AND p.status::text NOT IN('CANCELLED','ARCHIVED')
      AND o.customer_id=p.customer_id AND o.accepted_at IS NOT NULL;
  IF v_customer IS NULL OR v_origin->'accepted_snapshot' IS NULL
    OR v_origin->'accepted_snapshot'='null'::jsonb THEN
    RAISE EXCEPTION 'El evento no tiene un origen comercial aceptado';
  END IF;
  INSERT INTO orbit_tributary_preview.document(project_id,customer_id,kind,snapshot)
  VALUES(p_project,v_customer,p_kind,v_origin->'accepted_snapshot')
  ON CONFLICT(project_id) WHERE kind IN(33,39) DO NOTHING
  RETURNING id INTO v_document;
  IF v_document IS NULL THEN
    SELECT d.id INTO v_document FROM orbit_tributary_preview.document d
      WHERE d.project_id=p_project AND d.kind=p_kind;
    IF v_document IS NULL THEN RAISE EXCEPTION 'El evento ya tiene una intención fiscal de otro tipo'; END IF;
  ELSE
    INSERT INTO orbit_tributary_preview.audit(document_id,actor,action)
    VALUES(v_document,auth.uid(),'BORRADOR');
  END IF;
  RETURN v_document;
END;
$$;
CREATE FUNCTION public.orbit_tributary_approve(p_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM orbit_tributary_preview.assert_access();
  UPDATE orbit_tributary_preview.document SET state='APROBADO'
    WHERE id=p_id AND state='BORRADOR' AND kind IN(33,39);
  IF FOUND THEN
    INSERT INTO orbit_tributary_preview.audit(document_id,actor,action) VALUES(p_id,auth.uid(),'APROBADO');
  ELSIF NOT EXISTS (SELECT 1 FROM orbit_tributary_preview.document WHERE id=p_id AND state='APROBADO') THEN
    RAISE EXCEPTION 'No se puede aprobar esta intención';
  END IF;
END;
$$;

CREATE FUNCTION public.orbit_tributary_note(p_id bigint,p_kind integer)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  original orbit_tributary_preview.document%ROWTYPE;
  v_id bigint;
BEGIN
  PERFORM orbit_tributary_preview.assert_access();
  SELECT * INTO original FROM orbit_tributary_preview.document WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR p_kind IS NULL OR p_kind NOT IN(56,61)
    OR (p_kind=61 AND (original.kind NOT IN(33,39) OR original.state<>'APROBADO'))
    OR (p_kind=56 AND original.kind<>61) THEN
    RAISE EXCEPTION 'Referencia incompatible con la nota de prueba';
  END IF;
  INSERT INTO orbit_tributary_preview.document(project_id,customer_id,kind,parent_id,snapshot)
    VALUES(original.project_id,original.customer_id,p_kind,original.id,original.snapshot)
    ON CONFLICT(parent_id,kind) WHERE kind IN(56,61) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM orbit_tributary_preview.document WHERE parent_id=original.id AND kind=p_kind;
  ELSE
    INSERT INTO orbit_tributary_preview.audit(document_id,actor,action) VALUES(v_id,auth.uid(),'NOTA DE PRUEBA');
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.orbit_tributary_approve(bigint),public.orbit_tributary_note(bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tributary_approve(bigint),public.orbit_tributary_note(bigint,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.orbit_tributary_list(uuid,uuid),public.orbit_tributary_draft(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tributary_list(uuid,uuid),public.orbit_tributary_draft(uuid,integer) TO authenticated;
CREATE FUNCTION public.orbit_tributary_document(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  PERFORM orbit_tributary_preview.assert_access();
  SELECT jsonb_build_object('kind',kind,'created_at',created_at,'snapshot',snapshot)
  INTO result FROM orbit_tributary_preview.document WHERE id=p_id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.orbit_tributary_document(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tributary_document(bigint) TO authenticated;
COMMIT;
