BEGIN;
CREATE SCHEMA orbit_sii_cert;
REVOKE ALL ON SCHEMA orbit_sii_cert FROM PUBLIC;
SET LOCAL search_path = orbit_sii_cert, pg_catalog;

CREATE TABLE issuer (
    rut text PRIMARY KEY,
    legal_name text NOT NULL,
    cert_ref text NOT NULL,
    cert_from timestamptz NOT NULL,
    cert_until timestamptz NOT NULL CHECK (cert_until > cert_from),
    alert_folios integer NOT NULL DEFAULT 20 CHECK (alert_folios BETWEEN 1 AND 10000),
    alert_days integer NOT NULL DEFAULT 30 CHECK (alert_days BETWEEN 1 AND 365)
);
CREATE TABLE caf (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issuer text NOT NULL REFERENCES issuer(rut),
    kind smallint NOT NULL CHECK (kind IN (33, 39, 56, 61)),
    first_folio integer NOT NULL CHECK (first_folio > 0),
    last_folio integer NOT NULL CHECK (last_folio >= first_folio AND last_folio < 2147483647),
    next_folio integer NOT NULL CHECK (next_folio BETWEEN first_folio AND last_folio + 1),
    key_ref text NOT NULL,
    valid_on date NOT NULL,
    until_on date,
    enabled boolean NOT NULL DEFAULT true,
    CHECK (until_on IS NULL OR until_on >= valid_on)
);
CREATE FUNCTION ensure_caf_range() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog AS $$
BEGIN
    PERFORM 1 FROM orbit_sii_cert.issuer WHERE rut=NEW.issuer FOR UPDATE;
    IF EXISTS (SELECT 1 FROM orbit_sii_cert.caf c WHERE c.issuer=NEW.issuer
        AND c.kind=NEW.kind AND c.id<>NEW.id
        AND c.first_folio<=NEW.last_folio AND c.last_folio>=NEW.first_folio) THEN
        RAISE EXCEPTION 'Rango CAF superpuesto';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER reject_caf_overlap BEFORE INSERT OR UPDATE OF issuer,kind,first_folio,last_folio
    ON caf FOR EACH ROW EXECUTE FUNCTION ensure_caf_range();
CREATE TABLE document (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issuer text NOT NULL REFERENCES issuer(rut),
    kind smallint NOT NULL CHECK (kind IN (33, 39, 56, 61)),
    folio integer NOT NULL CHECK (folio > 0),
    caf_id bigint NOT NULL REFERENCES caf(id),
    operation text NOT NULL,
    scope text NOT NULL,
    input_hash bytea NOT NULL CHECK (octet_length(input_hash) = 32),
    state text NOT NULL DEFAULT 'RESERVED' CHECK (state IN
        ('RESERVED','READY','SENDING','UNKNOWN','RECEIVED','ACCEPTED','REJECTED')),
    signed_xml bytea,
    pdf bytea,
    issue_date date,
    total bigint CHECK (total >= 0),
    track text CHECK (track ~ '^[0-9]{1,20}$'),
    lookup_hash bytea UNIQUE CHECK (lookup_hash IS NULL OR octet_length(lookup_hash) = 32),
    updated_at timestamptz NOT NULL DEFAULT now(),
    poll_after timestamptz NOT NULL DEFAULT now(),
    lease uuid,
    UNIQUE (issuer, kind, folio),
    UNIQUE (issuer, operation),
    UNIQUE (issuer, scope)
);
CREATE UNIQUE INDEX document_track ON document (issuer, (kind = 39), track) WHERE track IS NOT NULL;
CREATE INDEX document_poll ON document (poll_after) WHERE state = 'RECEIVED';
CREATE TABLE audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id bigint REFERENCES document(id),
    issuer text NOT NULL REFERENCES issuer(rut),
    actor text NOT NULL,
    action text NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE issuer ENABLE ROW LEVEL SECURITY;
ALTER TABLE caf ENABLE ROW LEVEL SECURITY;
ALTER TABLE document ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA orbit_sii_cert FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA orbit_sii_cert FROM PUBLIC;
COMMIT;
