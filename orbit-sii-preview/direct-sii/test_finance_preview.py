"""Pruebas de extremo a extremo para el laboratorio tributario."""
import base64
import io
import os
from pathlib import Path
import re
import secrets
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import patch

from finance_preview import create_app, production_start


@unittest.skipUnless(os.getenv("ORBIT_XSD_DTE") and os.getenv("ORBIT_XSD_BOLETA"),
                     "Requiere ambos esquemas oficiales y Node")
class LabTests(unittest.TestCase):
    def test_full_workflow(self):
        with tempfile.TemporaryDirectory() as tmp:
            password = secrets.token_urlsafe(32)
            env = {"ORBIT_LAB_DATA":tmp, "ORBIT_LAB_PASSWORD":password,
                   "ORBIT_LAB_KEY":base64.b64encode(secrets.token_bytes(32)).decode()}
            with patch.dict(os.environ,env):
                app = create_app()
                app.testing = True
                c = app.test_client()
                auth = {"Authorization":"Basic "+base64.b64encode(("laboratorio:"+password).encode()).decode()}
                def get(path):
                    return c.get(path,headers=auth)
                db_path=Path(tmp,"finance-lab.sqlite")
                def sql(statement):
                    with sqlite3.connect(db_path) as db:
                        return db.execute(statement).fetchall()
                def settle():
                    sql("UPDATE documents SET due_at=0 WHERE state='PENDIENTE'")
                    self.assertEqual(post("/reconcile").status_code,303)
                def post(path,**data):
                    return c.post(path,headers=auth,data={"csrf":csrf,**data})
                self.assertEqual(c.get("/").status_code,401)
                start=time.monotonic()
                home=get("/")
                print(f"Panel local inicial: {(time.monotonic()-start)*1000:.1f} ms")
                self.assertEqual(home.status_code,200)
                csrf=re.search(rb'name="csrf" value="([^"]+)"',home.data)[1].decode()
                self.assertEqual(c.post("/documents",headers=auth).status_code,403)
                for identifier,event,kind,parent in ((1,"DEMO-01",33,None),(2,"DEMO-02",39,None),
                        (3,"DEMO-01",61,1),(4,"DEMO-01",56,3)):
                    fields={"event":event,"kind":kind}
                    if parent:
                        fields["parent"]=parent
                    self.assertEqual(post("/documents",**fields).status_code,303)
                    self.assertEqual(post("/documents",**fields).status_code,409)
                    path=f"/documents/{identifier}"
                    start=time.monotonic()
                    preview=get(path+"/preview")
                    print(f"Vista previa {kind}: {(time.monotonic()-start)*1000:.0f} ms")
                    self.assertTrue(preview.data.startswith(b"%PDF-"))
                    self.assertEqual(post(path+"/issue").status_code,409)
                    self.assertEqual(post(path+"/approve").status_code,303)
                    start=time.monotonic()
                    self.assertEqual(post(path+"/issue").status_code,303)
                    print(f"Emisión simulada {kind}: {(time.monotonic()-start)*1000:.0f} ms")
                    self.assertEqual(post(path+"/issue").status_code,409)
                    self.assertEqual(c.get(path+"/download/pdf").status_code,401)
                    self.assertTrue(get(path+"/download/pdf").data.startswith(b"%PDF-"))
                    self.assertIn(f"<TipoDTE>{kind}</TipoDTE>".encode(),get(path+"/download/xml").data)
                    self.assertFalse(sql(f"SELECT pdf FROM documents WHERE id={identifier}")[0][0].startswith(b"%PDF-"))
                    settle()
                    if kind in (33,61,56):
                        expected = b"$0" if kind==61 else b"$535.500"
                        self.assertIn(expected,get("/?event=DEMO-01").data)
                    self.assertEqual(post(path+"/mail").status_code,303)
                    self.assertEqual(post(path+"/mail").status_code,303)
                    self.assertIn("Envío deshabilitado".encode(),get(path+"/correo").data)
                self.assertEqual(sql("SELECT kind,folio,state FROM documents ORDER BY id"),
                                 [(33,101,"ACEPTADO"),(39,101,"ACEPTADO"),(61,101,"ACEPTADO"),(56,101,"ACEPTADO")])
                self.assertEqual(sql("SELECT count(*) FROM mail_preview"),[(4,)])
                response=post("/documents/2/receipt")
                code=re.search(rb'name="code" value="([^"]+)"',response.data)[1].decode()
                self.assertEqual(c.post("/boletas",data={"code":"x"*43}).status_code,404)
                self.assertEqual(c.post("/boletas",data={"code":code}).data,get("/documents/2/download/pdf").data)
                post("/documents/2/receipt")
                self.assertEqual(c.post("/boletas",data={"code":code}).status_code,404)
                payload=b'[{"kind":33,"folio":1104,"sha256":"'+b'a'*64+b'"}]'
                for _ in range(2):
                    self.assertEqual(post("/history",inventory=(io.BytesIO(payload),"historico.json")).status_code,303)
                self.assertEqual(sql("SELECT count(*) FROM archive_inventory"),[(1,)])
                cli=app.test_cli_runner().invoke(args=["backup-lab"])
                self.assertEqual(cli.exit_code,0, str(cli.exception))
                copy=Path(cli.output.strip())
                with sqlite3.connect(copy) as restored:
                    self.assertEqual(restored.execute("SELECT count(*) FROM documents").fetchone()[0],4)


class FolioTests(unittest.TestCase):
    def test_cutover(self):
        self.assertIsNone(production_start(1104,2000))
        self.assertIsNone(production_start(1104,2000,(2001,2099),1104))
        self.assertIsNone(production_start(1104,2000,(2000,2099),2000))
        self.assertEqual(production_start(1104,2000,(2000,2099),1104),2000)
