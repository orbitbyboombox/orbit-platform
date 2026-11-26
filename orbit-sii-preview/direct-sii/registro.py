"""Registro local transaccional del prototipo de certificación."""
import hashlib
import secrets
import sqlite3
from motor import parse, validate, verify_generated, SII

SCHEMA = """
CREATE TABLE IF NOT EXISTS fiscal_job(
  issuer TEXT NOT NULL, kind INTEGER NOT NULL CHECK(kind IN(33,39,61)),
  folio INTEGER NOT NULL CHECK(folio>0), operation TEXT NOT NULL, sale_scope TEXT NOT NULL,
  input_hash TEXT NOT NULL, state TEXT NOT NULL,
  signed_xml BLOB, track TEXT, receipt_code TEXT, lookup_hash TEXT UNIQUE, issue_date TEXT, total INTEGER,
  PRIMARY KEY(issuer,kind,folio), UNIQUE(issuer,operation), UNIQUE(issuer,sale_scope)
);
"""

class Ledger:
    def __init__(self,path):
        self.db=sqlite3.connect(path,isolation_level=None,timeout=10)
        self.db.row_factory=sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(SCHEMA)

    def get(self,issuer,operation):
        return self.db.execute("SELECT * FROM fiscal_job WHERE issuer=? AND operation=?",(issuer,operation)).fetchone()

    def reserve(self,issuer,kind,operation,scope,digest,lo,hi):
        if not operation or not scope or not 0<lo<=hi or hi-lo>1_000_000: raise ValueError("Rango o intención inválido")
        self.db.execute("BEGIN IMMEDIATE")
        try:
            old=self.get(issuer,operation)
            if old:
                if (old["kind"],old["sale_scope"],old["input_hash"])!=(kind,scope,digest): raise ValueError("La intención ya existe con otro contenido")
                folio=old["folio"]
            else:
                used={r[0] for r in self.db.execute("SELECT folio FROM fiscal_job WHERE issuer=? AND kind=? AND folio BETWEEN ? AND ?",(issuer,kind,lo,hi))}
                folio=next((f for f in range(lo,hi+1) if f not in used),None)
                if folio is None: raise ValueError("Rango CAF agotado")
                self.db.execute("INSERT INTO fiscal_job(issuer,kind,folio,operation,sale_scope,input_hash,state) VALUES(?,?,?,?,?,?,'RESERVED')",(issuer,kind,folio,operation,scope,digest))
            self.db.execute("COMMIT")
            return folio
        except Exception:
            self.db.execute("ROLLBACK")
            raise

    def stage(self,issuer,operation,xml,cert,schema):
        row=self.get(issuer,operation)
        if not row or row["state"]!="RESERVED": raise ValueError("Intención no disponible")
        validate(xml,schema); verify_generated(xml,cert)
        doc=parse(xml)
        expected="EnvioBOLETA" if row["kind"]==39 else "EnvioDTE"
        if doc.tag!=f"{{{SII}}}{expected}": raise ValueError("Sobre incorrecto")
        def field(path):
            return doc.findtext(f".//{{{SII}}}Encabezado/"+"/".join(f"{{{SII}}}{p}" for p in path.split("/")))
        if (field("Emisor/RUTEmisor"),field("IdDoc/TipoDTE"),field("IdDoc/Folio"))!=(issuer,str(row["kind"]),str(row["folio"])):
            raise ValueError("El XML no corresponde a la reserva")
        count=self.db.execute("UPDATE fiscal_job SET signed_xml=?,issue_date=?,total=?,state='READY' WHERE issuer=? AND operation=? AND state='RESERVED'",
                             (xml,field("IdDoc/FchEmis"),int(field("Totales/MntTotal")),issuer,operation)).rowcount
        if count!=1: raise ValueError("Otra operación ya fijó el XML")

    def submit_once(self,issuer,operation,sender,token,adapter):
        changed=self.db.execute("UPDATE fiscal_job SET state='SENDING' WHERE issuer=? AND operation=? AND state='READY'",(issuer,operation)).rowcount
        if changed!=1: raise ValueError("Envío bloqueado hasta conciliar")
        row=self.get(issuer,operation)
        try:
            receipt=adapter.submit(row["kind"],row["signed_xml"],sender,issuer,token)
            self.db.execute("UPDATE fiscal_job SET state='RECEIVED',track=?,receipt_code=? WHERE issuer=? AND operation=? AND state='SENDING'",
                            (receipt["track"],receipt["code"],issuer,operation))
        except Exception:
            self.db.execute("UPDATE fiscal_job SET state='UNKNOWN' WHERE issuer=? AND operation=? AND state='SENDING'",(issuer,operation))
            raise
        return self.get(issuer,operation)

    def reconcile_track(self,issuer,operation,folio,track,evidence_id):
        # The operator verifies the SII receipt against this document before calling.
        if not evidence_id or not track.isascii() or not track.isdigit() or len(track)>20:
            raise ValueError("Falta evidencia del Track ID")
        count=self.db.execute("UPDATE fiscal_job SET state='RECEIVED',track=?,receipt_code=? WHERE issuer=? AND operation=? AND folio=? AND state IN ('UNKNOWN','SENDING')",
                              (track,evidence_id,issuer,operation,folio)).rowcount
        if count!=1: raise ValueError("Identidad o estado incompatible")

    def query_status(self,issuer,operation,token,adapter):
        row=self.get(issuer,operation)
        if not row or not row["track"]: raise ValueError("Conciliar con el registro del SII antes de cualquier reenvío")
        return adapter.status(row["kind"],issuer,row["track"],token)

    def record_verified_status(self,issuer,operation,track,folio,state,code):
        if state not in {"ACCEPTED","REJECTED"} or not code: raise ValueError("Estado inválido")
        count=self.db.execute("UPDATE fiscal_job SET state=?,receipt_code=? WHERE issuer=? AND operation=? AND track=? AND folio=? AND state='RECEIVED'",
                              (state,code,issuer,operation,track,folio)).rowcount
        if count!=1: raise ValueError("Identidad o transición incompatible")

    def receipt_link(self,issuer,operation):
        token=secrets.token_urlsafe(32)
        digest=hashlib.sha256(token.encode()).hexdigest()
        count=self.db.execute("UPDATE fiscal_job SET lookup_hash=? WHERE issuer=? AND operation=? AND kind=39 AND state='ACCEPTED' AND lookup_hash IS NULL",
                              (digest,issuer,operation)).rowcount
        if count!=1: raise ValueError("Boleta no disponible")
        return token

    def lookup(self,token):
        if not isinstance(token,str) or len(token)!=43: return None
        row=self.db.execute("SELECT folio,issue_date,total FROM fiscal_job WHERE lookup_hash=? AND kind=39 AND state='ACCEPTED'",
                            (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
        return dict(row) if row else None
