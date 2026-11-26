"""Pruebas de certificación con credenciales y documentos sintéticos."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest

from cryptography.exceptions import InvalidSignature
from motor import build, verify_ted
from test_motor import fixture, sample_bundle, schema


class TimbreTests(unittest.TestCase):
    def test_spanish_ted_and_tampering(self):
        for kind in (33, 39, 61):
            with self.subTest(kind=kind):
                doc, args = fixture(kind)
                xml, ted, _ = build(doc, **args)
                self.assertIn("Producción de eventos".encode("latin1"), xml)
                self.assertIn(b"Jos&#233; Mu&#241;oz", ted)
                self.assertIn(b"&#209;u&#241;oa", ted)
                verify_ted(ted, args["anchor"])
                with self.assertRaises(InvalidSignature):
                    verify_ted(ted.replace(b"11900", b"11901"), args["anchor"])
                with self.assertRaises(InvalidSignature):
                    verify_ted(ted.replace(b"ORBIT PRUEBAS", b"ORBIT ALTERADO"), args["anchor"])


@unittest.skipUnless(os.getenv("ORBIT_LOCAL_PG_TEST") == "1", "Requiere PostgreSQL local desechable")
class PostgresTests(unittest.TestCase):
    def test_complete_receipt_flow(self):
        from psycopg import connect, IntegrityError
        from psycopg.rows import dict_row
        from portal import create_app
        from postgres_ledger import PostgresLedger

        def db():
            return connect(host="127.0.0.1", port=55432, user="orbit_local",
                           password="orbit-local-fixture", dbname="postgres", row_factory=dict_row)

        with db() as conn:
            conn.execute(Path(__file__).with_name("postgres.sql").read_text())
            conn.execute("""INSERT INTO orbit_sii_cert.issuer VALUES
                ('11111111-1','DEMO','test/cert',now()-interval '1 day',now()+interval '2 days',20,30)""")
            conn.execute("""INSERT INTO orbit_sii_cert.caf
                (issuer,kind,first_folio,last_folio,next_folio,key_ref,valid_on)
                VALUES ('11111111-1',39,101,102,101,'test/caf',current_date-1)""")

        ledger = PostgresLedger(db, b"s" * 32)
        digest = hashlib.sha256(b"demo").digest()
        job = ledger.reserve("11111111-1", 39, "one", "sale-1", digest, "qa")
        self.assertEqual(ledger.reserve("11111111-1", 39, "one", "sale-1", digest, "qa")["id"], job["id"])
        with self.assertRaises(IntegrityError):
            ledger.reserve("11111111-1", 39, "two", "sale-1", digest, "qa")
        doc, args = fixture(39)
        xml, ted, amounts = build(doc, **args)
        with TemporaryDirectory() as tmp:
            bundle, output = Path(tmp, "39.json"), Path(tmp, "39.pdf")
            bundle.write_text(json.dumps(sample_bundle(doc, ted, amounts)), encoding="utf-8")
            subprocess.run(["node", str(Path(__file__).with_name("pdf417.mjs")), str(bundle), str(output)],
                           check=True)
            pdf = output.read_bytes()
        ledger.stage(job["id"], xml, pdf, args["cert"], schema(39), args["anchor"], "qa")
        with db() as conn:
            stored = conn.execute("SELECT pdf,signed_xml FROM orbit_sii_cert.document").fetchone()
            self.assertNotEqual(stored["pdf"], pdf)
            self.assertNotEqual(stored["signed_xml"], xml)

        class Timeout:
            def submit(self, *args):
                raise TimeoutError()

        with self.assertRaises(TimeoutError):
            ledger.submit_once(job["id"], Timeout(), "11111111-1", "test", "qa")
        with self.assertRaises(ValueError):
            ledger.submit_once(job["id"], Timeout(), "11111111-1", "test", "qa")
        ledger.attach_track(job["id"], 101, "123", "qa", "fixture")
        ledger.reconcile(lambda j: {**j, "folio": 102, "state": "ACCEPTED", "evidence": "wrong"})
        with self.assertRaises(ValueError):
            ledger.receipt_token(job["id"], "qa")
        with db() as conn:
            conn.execute("UPDATE orbit_sii_cert.document SET poll_after=now()")
        ledger.reconcile(lambda j: {**j, "state": "ACCEPTED", "evidence": "fixture"})
        token = ledger.receipt_token(job["id"], "qa")
        client = create_app(ledger, "a" * 32).test_client()
        self.assertEqual(client.get("/boletas").status_code, 200)
        self.assertEqual(client.post("/boletas/descargar", data={"code": "x" * 43}).status_code, 404)
        response = client.post("/boletas/descargar", data={"code": token})
        self.assertEqual(response.data, pdf)
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertEqual(client.get("/admin/tributario").status_code, 401)
        auth = {"Authorization": "Basic " + base64.b64encode(("certificacion:" + "a" * 32).encode()).decode()}
        self.assertIn("Folios bajo el umbral".encode(), client.get("/admin/tributario", headers=auth).data)
        self.assertEqual(ledger.reserve("11111111-1", 39, "two", "sale-2", digest, "qa")["folio"], 102)
        with self.assertRaisesRegex(ValueError, "Sin folios"):
            ledger.reserve("11111111-1", 39, "three", "sale-3", digest, "qa")
