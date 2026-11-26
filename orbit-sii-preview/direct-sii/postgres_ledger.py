"""Registro privado de certificación. Cada método abre su propia transacción."""
import hashlib
import os
import re
import secrets
from uuid import uuid4

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from motor import SII, parse, validate, verify_generated, verify_ted



class PostgresLedger:
    def __init__(self, connect, encryption_key):
        if len(encryption_key) != 32:
            raise ValueError("Se requiere una clave AES-256")
        self.connect = connect
        self.cipher = AESGCM(encryption_key)

    def _crypt(self, job, purpose, value, *, decrypt=False):
        identity = f"certification:{job['issuer']}:{job['kind']}:{job['folio']}:{purpose}".encode()
        if decrypt:
            return self.cipher.decrypt(value[:12], value[12:], identity)
        nonce = os.urandom(12)
        return nonce + self.cipher.encrypt(nonce, value, identity)

    @staticmethod
    def _audit(db, job, actor, action):
        db.execute("INSERT INTO orbit_sii_cert.audit(issuer, document_id, actor, action) VALUES (%s,%s,%s,%s)",
                   (job["issuer"], job.get("id"), actor, action))

    def reserve(self, issuer, kind, operation, scope, digest, actor):
        if not operation or not scope or len(digest) != 32:
            raise ValueError("Identidad de la intención inválida")
        with self.connect() as db:
            profile = db.execute("""SELECT now() BETWEEN cert_from AND cert_until AS valid
                FROM orbit_sii_cert.issuer WHERE rut=%s FOR UPDATE""", (issuer,)).fetchone()
            old = db.execute("""SELECT * FROM orbit_sii_cert.document
                WHERE issuer=%s AND operation=%s""", (issuer, operation)).fetchone()
            if old:
                if (old["kind"], old["scope"], old["input_hash"]) != (kind, scope, digest):
                    raise ValueError("La intención ya existe con otro contenido")
                return old
            if not profile or not profile["valid"]:
                raise ValueError("Certificado de certificación fuera de vigencia")
            available = db.execute("""UPDATE orbit_sii_cert.caf
                SET next_folio=next_folio+1 WHERE id=(SELECT id FROM orbit_sii_cert.caf
                    WHERE issuer=%s AND kind=%s AND enabled AND next_folio<=last_folio
                    AND valid_on <= (now() AT TIME ZONE 'America/Santiago')::date
                    AND (until_on IS NULL OR until_on >= (now() AT TIME ZONE 'America/Santiago')::date)
                    ORDER BY first_folio LIMIT 1 FOR UPDATE)
                RETURNING id,next_folio-1 AS folio""", (issuer, kind)).fetchone()
            if not available:
                raise ValueError("Sin folios disponibles")
            job = db.execute("""INSERT INTO orbit_sii_cert.document
                (issuer,kind,folio,caf_id,operation,scope,input_hash) VALUES (%s,%s,%s,%s,%s,%s,%s)
                RETURNING *""", (issuer, kind, available["folio"], available["id"], operation, scope, digest)).fetchone()
            self._audit(db, job, actor, "RESERVED")
            return job

    def stage(self, job_id, xml, pdf, cert, schema, anchor, actor):
        validate(xml, schema)
        verify_generated(xml, cert)
        start = xml.index(b'<TED version="1.0">')
        end = xml.index(b"</TED>", start) + len(b"</TED>")
        ted = xml[start:end]
        verify_ted(ted, anchor)
        stamp = parse(ted, "ISO-8859-1").find("DD")
        if not pdf.startswith(b"%PDF-") or len(pdf) > 8 * 1024 * 1024:
            raise ValueError("PDF inválido")
        header = parse(xml).find(f".//{{{SII}}}Encabezado")

        def field(*parts):
            return header.findtext("/".join(f"{{{SII}}}{part}" for part in parts))

        with self.connect() as db:
            job = db.execute("SELECT * FROM orbit_sii_cert.document WHERE id=%s FOR UPDATE", (job_id,)).fetchone()
            if not job or job["state"] != "RESERVED":
                raise ValueError("Reserva no disponible")
            identity = field("Emisor", "RUTEmisor"), int(field("IdDoc", "TipoDTE")), int(field("IdDoc", "Folio"))
            stamped = (stamp.findtext("RE"), int(stamp.findtext("TD")), int(stamp.findtext("F")))
            if (identity != (job["issuer"], job["kind"], job["folio"]) or stamped != identity
                    or stamp.findtext("FE") != field("IdDoc", "FchEmis")
                    or stamp.findtext("MNT") != field("Totales", "MntTotal")
                    or stamp.findtext("RR") != field("Receptor", "RUTRecep")):
                raise ValueError("XML fuera de la reserva")
            db.execute("""UPDATE orbit_sii_cert.document SET signed_xml=%s,pdf=%s,
                issue_date=%s,total=%s,state='READY',updated_at=now() WHERE id=%s""",
                (self._crypt(job, "xml", xml), self._crypt(job, "pdf", pdf),
                 field("IdDoc", "FchEmis"), int(field("Totales", "MntTotal")), job_id))
            self._audit(db, job, actor, "READY")

    def submit_once(self, job_id, adapter, sender, token, actor):
        with self.connect() as db:
            job = db.execute("""UPDATE orbit_sii_cert.document AS d SET state='SENDING',updated_at=now()
                FROM orbit_sii_cert.issuer AS i WHERE d.id=%s AND d.issuer=i.rut AND d.state='READY'
                AND now() BETWEEN i.cert_from AND i.cert_until RETURNING d.*""", (job_id,)).fetchone()
            if not job:
                raise ValueError("Envío bloqueado")
            self._audit(db, job, actor, "SENDING")
        try:
            result = adapter.submit(job["kind"], self._crypt(job, "xml", job["signed_xml"], decrypt=True),
                                    sender, job["issuer"], token)
            self.attach_track(job_id, job["folio"], result["track"], actor, "RECIBO_TRANSPORTE")
        except Exception:
            with self.connect() as db:
                db.execute("""UPDATE orbit_sii_cert.document SET state='UNKNOWN',updated_at=now()
                    WHERE id=%s AND state='SENDING'""", (job_id,))
                self._audit(db, job, actor, "SEND_UNCERTAIN")
            raise

    def attach_track(self, job_id, folio, track, actor, evidence):
        if not evidence or not re.fullmatch(r"[0-9]{1,20}", track):
            raise ValueError("Track ID sin evidencia")
        with self.connect() as db:
            job = db.execute("""UPDATE orbit_sii_cert.document SET state='RECEIVED',
                track=%s,updated_at=now(),poll_after=now()
                WHERE id=%s AND folio=%s AND state IN ('SENDING','UNKNOWN') RETURNING *""",
                (track, job_id, folio)).fetchone()
            if not job:
                raise ValueError("Envío no conciliable")
            self._audit(db, job, actor, "TRACK:" + evidence)

    def reconcile(self, query_document, *, limit=10):
        """El comprobador entrega identidad y evidencia verificadas para cada DTE."""
        with self.connect() as db:
            expired = db.execute("""UPDATE orbit_sii_cert.document SET state='UNKNOWN',updated_at=now()
                WHERE state='SENDING' AND updated_at < now() - interval '5 minutes'
                RETURNING issuer,id""").fetchall()
            for job in expired:
                self._audit(db, job, "conciliador", "SEND_LEASE_EXPIRED")
        for _ in range(limit):
            lease = uuid4()
            with self.connect() as db:
                job = db.execute("""UPDATE orbit_sii_cert.document SET
                    poll_after=now()+interval '5 minutes',lease=%s WHERE id=(
                    SELECT id FROM orbit_sii_cert.document WHERE state='RECEIVED'
                    AND poll_after<=now() ORDER BY poll_after,id LIMIT 1 FOR UPDATE SKIP LOCKED)
                    RETURNING *""", (lease,)).fetchone()
            if not job:
                return
            try:
                result = query_document(job)
            except (ValueError, OSError):
                result = None
            if not result or result.get("state") not in {"ACCEPTED", "REJECTED"} or not result.get("evidence"):
                continue
            keys = ("issuer", "kind", "folio", "track")
            if tuple(result.get(key) for key in keys) != tuple(job[key] for key in keys):
                continue
            with self.connect() as db:
                changed = db.execute("""UPDATE orbit_sii_cert.document SET state=%s,lease=NULL,updated_at=now()
                    WHERE id=%s AND lease=%s AND state='RECEIVED' RETURNING issuer,id""",
                    (result["state"], job["id"], lease)).fetchone()
                if changed:
                    self._audit(db, changed, "conciliador", result["state"] + ":" + result["evidence"])

    def receipt_token(self, job_id, actor):
        token = secrets.token_urlsafe(32)
        with self.connect() as db:
            job = db.execute("""UPDATE orbit_sii_cert.document SET lookup_hash=%s WHERE id=%s
                AND kind=39 AND state='ACCEPTED' AND lookup_hash IS NULL AND pdf IS NOT NULL
                RETURNING issuer,id""", (hashlib.sha256(token.encode()).digest(), job_id)).fetchone()
            if not job:
                raise ValueError("Boleta no disponible")
            self._audit(db, job, actor, "RECEIPT_ENABLED")
        return token

    def receipt_pdf(self, token):
        if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            return None
        with self.connect() as db:
            job = db.execute("""SELECT issuer,kind,folio,pdf FROM orbit_sii_cert.document
                WHERE lookup_hash=%s AND kind=39 AND state='ACCEPTED'""",
                (hashlib.sha256(token.encode()).digest(),)).fetchone()
        return (job["folio"], self._crypt(job, "pdf", job["pdf"], decrypt=True)) if job else None

    def configuration(self):
        with self.connect() as db:
            return db.execute("""SELECT i.rut,i.legal_name,i.cert_until,
                now() >= i.cert_until - make_interval(days=>i.alert_days) AS certificate_alert,
                t.kind, COALESCE(c.available,0) AS available,
                COALESCE(c.available,0) <= i.alert_folios AS folios_alert,
                (SELECT count(*) FROM orbit_sii_cert.document d WHERE d.issuer=i.rut
                AND d.kind=t.kind AND d.state='UNKNOWN') AS uncertain
                FROM orbit_sii_cert.issuer i CROSS JOIN (VALUES (33),(39),(61)) t(kind)
                LEFT JOIN LATERAL (SELECT sum(last_folio-next_folio+1) AS available
                    FROM orbit_sii_cert.caf WHERE issuer=i.rut AND kind=t.kind AND enabled
                    AND valid_on <= (now() AT TIME ZONE 'America/Santiago')::date
                    AND (until_on IS NULL OR until_on >= (now() AT TIME ZONE 'America/Santiago')::date)) c ON true
                ORDER BY i.rut,t.kind""").fetchall()
