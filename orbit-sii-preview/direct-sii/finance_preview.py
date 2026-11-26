"""Flujo tributario de laboratorio. El proceso opera exclusivamente con datos sintéticos."""
import base64
from contextlib import contextmanager
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
from datetime import datetime, timezone
from tempfile import TemporaryDirectory

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from flask import Flask, Response, abort, redirect, render_template, request, session, url_for

from certification_samples import ISSUER
from motor import build, calculate, validate
from test_motor import fixture, sample_bundle

HERE = Path(__file__).resolve().parent
CERT_EXPIRES = datetime(2027,1,1,tzinfo=timezone.utc)
TYPES = {33: "Factura", 39: "Boleta", 56: "Nota de débito", 61: "Nota de crédito"}
EVENTS = {
    "DEMO-01": dict(name="Gala de aniversario", customer="Cliente de prueba A", rut="11111111-1",
                    address="Dirección de prueba 101", city="Santiago", activity="Organización de eventos",
                    email="cliente-a@example.invalid", payment="Crédito 30 días",
                    lines=[{"name":"Cabina Classic (3 horas)", "amount":400000},
                           {"name":"Álbum de firmas", "amount":50000}]),
    "DEMO-02": dict(name="Celebración familiar", customer="Cliente de prueba B", rut="22222222-2",
                    address="Dirección de prueba 102", city="Colina", activity="Particular",
                    email="cliente-b@example.invalid", payment="Contado",
                    lines=[{"name":"Cabina de fotos", "amount":300000}]),
}

SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS number_series(
    kind INTEGER PRIMARY KEY CHECK(kind IN(33,39,56,61)),
    next INTEGER NOT NULL, last INTEGER NOT NULL CHECK(last < 1104)
);
INSERT OR IGNORE INTO number_series VALUES (33,101,109),(39,101,109),(56,101,109),(61,101,109);
CREATE TABLE IF NOT EXISTS documents(
    id INTEGER PRIMARY KEY, event TEXT NOT NULL, kind INTEGER NOT NULL,
    parent INTEGER REFERENCES documents(id), snapshot TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN('BORRADOR','APROBADO','PENDIENTE','ACEPTADO','RECHAZADO')),
    folio INTEGER, xml BLOB, pdf BLOB, receipt_hash BLOB UNIQUE, due_at INTEGER,
    UNIQUE(kind,folio)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_sale ON documents(event) WHERE kind IN(33,39);
CREATE UNIQUE INDEX IF NOT EXISTS one_reversal ON documents(parent,kind) WHERE kind IN(56,61);
CREATE INDEX IF NOT EXISTS pending_index ON documents(state, due_at);
CREATE TABLE IF NOT EXISTS audit(
    id INTEGER PRIMARY KEY, document INTEGER REFERENCES documents(id), action TEXT NOT NULL,
    actor TEXT NOT NULL, at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mail_preview(document INTEGER PRIMARY KEY REFERENCES documents(id),
    recipient TEXT NOT NULL, subject TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS archive_inventory(kind INTEGER NOT NULL, folio INTEGER NOT NULL,
    digest TEXT NOT NULL, UNIQUE(kind,folio));
"""


def production_start(last_reported, requested, authorized_range=None, reconciled_last=None):
    """Planifica un corte. Nunca reserva ni consume folios."""
    if authorized_range is None or reconciled_last is None:
        return None
    first, last = authorized_range
    if any(type(n) is not int or n < 1 for n in (first,last,requested,last_reported,reconciled_last)):
        return None
    return requested if first <= requested <= last and requested > max(last_reported, reconciled_last) else None


class Store:
    def __init__(self, path, key):
        self.path = path
        self.cipher = AESGCM(key)
        with self.db() as db:
            db.executescript(SCHEMA)
        Path(path).chmod(0o600)

    @contextmanager
    def db(self, *, write=False):
        db = sqlite3.connect(self.path, timeout=8)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                if write:
                    db.execute("BEGIN IMMEDIATE")
                yield db
        finally:
            db.close()

    def encrypt(self, identifier, purpose, data):
        nonce = os.urandom(12)
        aad = f"orbit-lab:{identifier}:{purpose}".encode()
        return nonce + self.cipher.encrypt(nonce, data, aad)

    def decrypt(self, identifier, purpose, value):
        return self.cipher.decrypt(value[:12], value[12:], f"orbit-lab:{identifier}:{purpose}".encode())


def audit(db, identifier, action, actor="administración-lab"):
    db.execute("INSERT INTO audit(document,action,actor) VALUES(?,?,?)", (identifier,action,actor))


def reconcile(db):
    rows = db.execute("""UPDATE documents SET state='ACEPTADO' WHERE state='PENDIENTE'
        AND due_at<=unixepoch() RETURNING id""").fetchall()
    for row in rows:
        audit(db, row["id"], "ACEPTACIÓN SIMULADA", "conciliador-lab")


def artifacts(payload, folder, identifier, signed=False, folio=None):
    d = json.loads(payload)
    ted, xml = b"", None
    _, totals, _ = calculate(d)
    d["folio"] = folio or 101
    if signed:
        _, arguments = fixture(d["kind"], issuer_rut=ISSUER["rut"])
        xml, ted, totals = build(d, **arguments)
        schema = os.environ["ORBIT_XSD_BOLETA" if d["kind"] == 39 else "ORBIT_XSD_DTE"]
        validate(xml, schema)
    bundle = sample_bundle(d, ted, totals)
    bundle["issuer"].update(rut="76.565.272-3", activity=ISSUER["activity"], address=ISSUER["address"],
                            city=ISSUER["city"], office="Santiago Norte", email="contacto@bbox.cl", website="www.bbox.cl")
    bundle["document"]["folio"] = folio if signed else "POR ASIGNAR"
    if not d["lines"]:
        bundle["document"]["snapshot"]["lines"] = [
            {"name": d["reference"]["reason"], "net": 0, "textOnly": True}]
    bundle["document"]["snapshot"]["exempt"] = totals.get("exempt", 0)
    input_path, output_path = folder / f"{identifier}.json", folder / f"{identifier}.pdf"
    input_path.write_text(json.dumps(bundle), encoding="utf-8")
    subprocess.run(["node", str(HERE/"preview_pdf.mjs"), str(input_path), str(output_path)],
                   capture_output=True, timeout=15, check=True)
    return xml, output_path.read_bytes()


def create_app():
    app = Flask(__name__)
    directory = Path(os.environ["ORBIT_LAB_DATA"]).expanduser().resolve()
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.stat().st_mode & 0o077:
        raise RuntimeError("ORBIT_LAB_DATA debe ser privado, con permisos 0700")
    key = base64.b64decode(os.environ["ORBIT_LAB_KEY"], validate=True)
    if len(key) != 32:
        raise RuntimeError("ORBIT_LAB_KEY requiere 32 bytes")
    store = Store(directory/"finance-lab.sqlite", key)
    password = os.environ["ORBIT_LAB_PASSWORD"]
    if len(password) < 24:
        raise RuntimeError("Usar una contraseña de laboratorio de al menos 24 caracteres")
    app.secret_key = hashlib.sha256(key + b"orbit-session").digest()
    app.config.update(MAX_CONTENT_LENGTH=64_000, TRUSTED_HOSTS=["localhost","127.0.0.1"], SESSION_COOKIE_HTTPONLY=True,
                      SESSION_COOKIE_SAMESITE="Strict", SESSION_COOKIE_SECURE=os.getenv("ORBIT_LAB_TLS") == "1")

    @app.before_request
    def authenticate():
        if request.endpoint in {"receipt", "static"}:
            return
        a = request.authorization
        if not (a and a.type=="basic" and a.username=="laboratorio"
                and hmac.compare_digest((a.password or "").encode(), password.encode())):
            return Response("Acceso privado de laboratorio", 401,
                            {"WWW-Authenticate": 'Basic realm="ORBIT Tributario LAB"'})
        if request.method == "POST":
            if not hmac.compare_digest(session.get("csrf", ""), request.form.get("csrf", "-")):
                abort(403)
        session.setdefault("csrf", secrets.token_urlsafe(32))

    @app.after_request
    def private(response):
        response.headers.update({"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
                                 "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer",
                                 "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'"})
        return response

    def get_document(db, identifier):
        doc = db.execute("SELECT * FROM documents WHERE id=?", (identifier,)).fetchone()
        if doc is None:
            abort(404)
        return doc

    @app.get("/")
    def dashboard():
        active = request.args.get("event")
        if active and active not in EVENTS:
            abort(404)
        with store.db() as db:
            docs = db.execute("""SELECT id,event,kind,parent,state,folio,snapshot FROM documents
                WHERE (? IS NULL OR event=?) ORDER BY id DESC""", (active,active)).fetchall()
            series = db.execute("SELECT *,last-next+1 AS available FROM number_series ORDER BY kind").fetchall()
            history = db.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 40").fetchall()
            imported = db.execute("SELECT count(*) FROM archive_inventory").fetchone()[0]
        balances = {event: 0 for event in EVENTS}
        for row in docs:
            if row["state"]=="ACEPTADO":
                payload=json.loads(row["snapshot"])
                if row["kind"]==33 and payload["payment_form"] == 2:
                    balances[row["event"]] += calculate(payload)[1]["total"]
                if row["kind"] in (56,61) and payload["payment_form"] == 2 and payload.get("credit_sale"):
                    balances[row["event"]] += calculate(payload)[1]["total"] * (-1 if row["kind"]==61 else 1)
        return render_template("finance_preview.html", types=TYPES, events=EVENTS, selected=active, docs=docs,
                               series=series, history=history, balances=balances, imported=imported, csrf=session["csrf"],
                               certificate_days=(CERT_EXPIRES-datetime.now(timezone.utc)).days)

    @app.post("/documents")
    def create_document():
        event_key = request.form.get("event")
        event = EVENTS.get(event_key)
        kind = request.form.get("kind", type=int)
        parent = request.form.get("parent", type=int)
        if not event or kind not in TYPES:
            abort(400)
        d = dict(kind=kind, date="2026-11-25", sender=ISSUER["rut"], resolution_date="2026-10-01", resolution_number=0, receiver={})
        d.update(issuer=ISSUER, lines=event["lines"], discount=0, payment_label=event["payment"],
                 payment_form=2 if event["payment"].startswith("Crédito") else 1)
        d.pop("reference", None)
        d["receiver"].update(rut="66666666-6" if kind==39 else event["rut"], name=event["customer"],
                             address=event["address"], city=event["city"], activity=event["activity"])
        try:
            with store.db(write=True) as db:
                if kind in (56,61):
                    prior = get_document(db, parent)
                    expected = (61,) if kind==56 else (33,39)
                    if prior["kind"] not in expected or prior["event"]!=event_key or prior["state"]!="ACEPTADO":
                        abort(409, "Referencia de laboratorio incompatible")
                    original=json.loads(prior["snapshot"])
                    d.update(lines=original["lines"], receiver=original["receiver"],
                             payment_form=original["payment_form"],
                             credit_sale=prior["kind"]==33 or original.get("credit_sale",False),
                             reference=dict(kind=prior["kind"], folio=prior["folio"], date=original["date"],
                                            reason="ANULACIÓN DE PRUEBA", total=calculate(original)[1]["total"]))
                elif parent is not None:
                    abort(400)
                identifier=db.execute("""INSERT INTO documents(event,kind,parent,snapshot,state)
                    VALUES(?,?,?,?,'BORRADOR') RETURNING id""", (event_key,kind,parent,json.dumps(d))).fetchone()[0]
                audit(db,identifier,"BORRADOR")
        except sqlite3.IntegrityError:
            abort(409,"Ya existe un documento para esa operación")
        return redirect(url_for("dashboard",event=event_key),303)

    @app.get("/documents/<int:identifier>/preview")
    def preview(identifier):
        with store.db() as db:
            doc=get_document(db,identifier)
            payload=doc["snapshot"]
        with TemporaryDirectory(dir=directory) as temp:
            _, pdf=artifacts(payload,Path(temp),identifier)
        return Response(pdf,mimetype="application/pdf")

    @app.post("/documents/<int:identifier>/<operation>")
    def transition(identifier, operation):
        if operation not in {"approve","issue","receipt","mail"}:
            abort(404)
        token=None
        try:
            with store.db(write=True) as db:
                doc=get_document(db,identifier)
                state=doc["state"]
                if operation=="approve" and state=="BORRADOR":
                    db.execute("UPDATE documents SET state='APROBADO' WHERE id=?", (identifier,))
                    audit(db,identifier,"APROBACIÓN")
                elif operation=="issue" and state=="APROBADO":
                    serial=db.execute("""UPDATE number_series SET next=next+1 WHERE kind=? AND next<=last
                        RETURNING next-1 AS folio""", (doc["kind"],)).fetchone()
                    if serial is None:
                        abort(409,"Rango sintético agotado")
                    folio=serial["folio"]
                    with TemporaryDirectory(dir=directory) as temp:
                        xml,pdf=artifacts(doc["snapshot"],Path(temp),identifier,signed=True,folio=folio)
                    db.execute("""UPDATE documents SET state='PENDIENTE',folio=?,xml=?,pdf=?,due_at=unixepoch()+2
                        WHERE id=?""", (folio,store.encrypt(identifier,"xml",xml),store.encrypt(identifier,"pdf",pdf),identifier))
                    audit(db,identifier,"EMISIÓN SIMULADA")
                elif operation=="receipt" and state=="ACEPTADO" and doc["kind"]==39:
                    token=secrets.token_urlsafe(32)
                    db.execute("UPDATE documents SET receipt_hash=? WHERE id=?", (hashlib.sha256(token.encode()).digest(),identifier))
                    audit(db,identifier,"CÓDIGO BOLETA ROTADO")
                elif operation=="mail" and state=="ACEPTADO":
                    previous=db.execute("""INSERT OR IGNORE INTO mail_preview VALUES(?,?,?)""",
                        (identifier,EVENTS[doc["event"]]["email"],f"{TYPES[doc['kind']]} de prueba · BOOMBOX®")).rowcount
                    if previous:
                        audit(db,identifier,"CORREO DE PRUEBA PREPARADO")
                    return redirect(url_for("email_preview",identifier=identifier),303)
                else:
                    abort(409,"Transición de laboratorio no disponible")
                event_key=doc["event"]
        except (subprocess.SubprocessError, KeyError, ValueError):
            abort(503,"No se pudo generar el documento. El folio sigue disponible.")
        if token:
            return render_template("finance_preview.html", receipt_mode=True, token=token)
        return redirect(url_for("dashboard",event=event_key),303)

    @app.get("/documents/<int:identifier>/correo")
    def email_preview(identifier):
        with store.db() as db:
            mail=db.execute("SELECT * FROM mail_preview WHERE document=?", (identifier,)).fetchone()
        if mail is None:
            abort(404)
        return render_template("finance_preview.html", mail=mail)

    @app.get("/documents/<int:identifier>/download/<extension>")
    def download(identifier, extension):
        if extension not in ("xml","pdf"):
            abort(404)
        with store.db() as db:
            doc=get_document(db,identifier)
            if doc[extension] is None:
                abort(404)
            payload=store.decrypt(identifier,extension,doc[extension])
        return Response(payload,mimetype="application/"+extension,
                        headers={"Content-Disposition":f'attachment; filename="orbit-lab-{identifier}.{extension}"'})

    @app.route("/boletas",methods=("GET","POST"))
    def receipt():
        missing=False
        if request.method=="POST":
            token=request.form.get("code","")
            if len(token)==43 and token.isascii():
                with store.db() as db:
                    doc=db.execute("""SELECT id,pdf FROM documents WHERE receipt_hash=?
                        AND kind=39 AND state='ACEPTADO'""", (hashlib.sha256(token.encode()).digest(),)).fetchone()
                if doc:
                    return Response(store.decrypt(doc["id"],"pdf",doc["pdf"]),mimetype="application/pdf",
                                    headers={"Content-Disposition":'attachment; filename="Boleta-prueba.pdf"'})
            missing=True
        return render_template("finance_preview.html",receipt_mode=True,missing=missing),404 if missing else 200

    @app.post("/reconcile")
    def reconcile_now():
        with store.db(write=True) as db:
            reconcile(db)
        return redirect(url_for("dashboard"),303)

    @app.cli.command("reconcile-lab")
    def reconcile_cli():
        with store.db(write=True) as db:
            reconcile(db)

    @app.cli.command("backup-lab")
    def backup_cli():
        backup_dir = directory / "backups"
        backup_dir.mkdir(mode=0o700, exist_ok=True)
        target = backup_dir / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + secrets.token_hex(4) + ".sqlite")
        descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(descriptor)
        try:
            with store.db() as source:
                destination = sqlite3.connect(target)
                try:
                    source.backup(destination)
                    if destination.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                        raise RuntimeError("Error verificando respaldo")
                finally:
                    destination.close()
        except Exception:
            target.unlink(missing_ok=True)
            raise
        print(target)

    @app.post("/history")
    def history_import():
        upload=request.files.get("inventory")
        if not upload:
            abort(400)
        try:
            entries=json.load(upload)
            if not isinstance(entries,list) or not 1<=len(entries)<=100:
                raise ValueError
            with store.db(write=True) as db:
                for entry in entries:
                    kind,number,digest=entry["kind"],entry["folio"],entry["sha256"]
                    if (kind not in TYPES or type(number) is not int or not 0<number<=1104 or
                        not isinstance(digest,str) or len(bytes.fromhex(digest))!=32 or len(digest)!=64):
                        raise ValueError
                    existing=db.execute("SELECT digest FROM archive_inventory WHERE kind=? AND folio=?",(kind,number)).fetchone()
                    if existing and existing["digest"]!=digest.lower():
                        abort(409,"El folio histórico ya tiene otro hash")
                    db.execute("INSERT OR IGNORE INTO archive_inventory VALUES(?,?,?)",(kind,number,digest.lower()))
                audit(db,None,"INVENTARIO HISTÓRICO DE PRUEBA")
        except (ValueError,TypeError,KeyError):
            abort(400,"Inventario de laboratorio inválido")
        return redirect(url_for("dashboard"),303)

    return app
