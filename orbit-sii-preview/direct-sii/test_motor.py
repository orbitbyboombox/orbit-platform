from base64 import b64encode
from datetime import datetime, timezone
import hashlib
from html import escape
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from motor import E, wire, nodes, put, b64int, sign, build, parse, validate, verify_generated, sign_seed
from registro import Ledger
from transporte import SiiDirect

def fixture(kind):
    anchor=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    caf_key=rsa.generate_private_key(public_exponent=65537,key_size=1024)
    key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,"ORBIT TEST KEY")])
    cert=(x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(1)
          .not_valid_before(datetime(2026,1,1,tzinfo=timezone.utc)).not_valid_after(datetime(2027,1,1,tzinfo=timezone.utc)).sign(key,hashes.SHA256()))
    caf=E.Element("CAF",version="1.0")
    da=put(caf,"DA",ns=None)
    nodes(da,(("RE","11111111-1"),("RS","ORBIT PRUEBAS"),("TD",kind)),None)
    nodes(put(da,"RNG",ns=None),(("D",101),("H",109)),None)
    put(da,"FA","2026-10-01",None)
    p=caf_key.public_key().public_numbers()
    nodes(put(da,"RSAPK",ns=None),(("M",b64int(p.n)),("E",b64int(p.e))),None)
    put(da,"IDK",100,None)
    put(caf,"FRMA",sign(anchor,wire(da)),None,algoritmo="SHA1withRSA")
    doc={"kind":kind,"folio":101,"date":"2026-11-25","sender":"11111111-1","resolution_date":"2026-10-01","resolution_number":0,
         "issuer":{"rut":"11111111-1","name":"ORBIT PRUEBAS","activity":"Producción de eventos","activity_code":932909,"address":"Domicilio de prueba","city":"Santiago"},
         "receiver":{"rut":"66666666-6" if kind==39 else "22222222-2","name":"RECEPTOR DEMO","activity":"Eventos","address":"Domicilio demo","city":"Santiago"},
         "lines":[{"name":"Producción de prueba","amount":10000},{"name":"Segundo concepto","amount":1000}],"discount":1000}
    if kind==61: doc["reference"]={"kind":33,"folio":97,"date":"2026-11-23","reason":"Anulación de prueba","total":11900}
    return doc,dict(caf_xml=wire(caf),caf_key=caf_key,key=key,cert=cert,anchor=anchor.public_key(),stamp="2026-11-25T12:01:00")

def schema(kind):
    return os.getenv("ORBIT_XSD_BOLETA" if kind==39 else "ORBIT_XSD_DTE")

class Tests(unittest.TestCase):
    def test_documents(self):
        for kind in (33,39,61):
            with self.subTest(kind=kind):
                doc,args=fixture(kind)
                xml,ted,amounts=build(doc,**args)
                self.assertIn(ted,xml)
                self.assertEqual(amounts,{"net":10000,"iva":1900,"total":11900})
                verify_generated(xml,args["cert"])
                if schema(kind): validate(xml,schema(kind))
                altered=parse(xml)
                altered.xpath("//*[local-name()='MntTotal']")[0].text="11901"
                with self.assertRaises(ValueError):verify_generated(wire(altered,declaration=True),args["cert"])
                self.assertIn(b"enveloped-signature",sign_seed("123456789",args["key"],args["cert"]))
                out=os.getenv("ORBIT_SYNTHETIC_SAMPLES")
                if out:
                    snapshot={"type":kind,"rut":"11111111-1","client":"RECEPTOR DEMO","event":"Evento sintético","payment":"Prueba",
                              "lines":[{"name":row["name"],"net":row["amount"]} for row in doc["lines"]],"discount":1000,
                              "net":amounts["net"],"tax":amounts["iva"],"total":amounts["total"],
                              "reference":doc.get("reference",None)}
                    if kind==61: snapshot["reference"]["type"]=33
                    bundle={"environment":"offline","ted":b64encode(ted).decode(),
                            "issuer":{"legalName":"ORBIT PRUEBAS","rut":"11111111-1"},
                            "document":{"folio":101,"issueDate":"2026-11-25","snapshot":snapshot}}
                    Path(out,f"{kind}.json").write_text(json.dumps(bundle))

    def test_caf_rejects_wrong_range(self):
        d,a=fixture(33);d["folio"]=110
        with self.assertRaisesRegex(ValueError,"CAF fuera"):build(d,**a)

    def test_lost_response_blocks_retry(self):
        if not schema(33):self.skipTest("Requiere XSD de factura")
        d,a=fixture(33);xml,_,_=build(d,**a)
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp,"qa.sqlite"); ledger=Ledger(path); concurrent=Ledger(path)
            digest=hashlib.sha256(b"fixture").hexdigest()
            self.assertEqual(ledger.reserve("11111111-1",33,"one","sale/1",digest,101,103),101)
            self.assertEqual(concurrent.reserve("11111111-1",33,"one","sale/1",digest,101,103),101)
            with self.assertRaises(sqlite3.IntegrityError):concurrent.reserve("11111111-1",39,"two","sale/1",digest,101,103)
            ledger.stage("11111111-1","one",xml,a["cert"],schema(33))
            class Timeout:
                def submit(self,*args):raise TimeoutError()
            with self.assertRaises(TimeoutError):ledger.submit_once("11111111-1","one","11111111-1","demo",Timeout())
            self.assertEqual(concurrent.get("11111111-1","one")["state"],"UNKNOWN")
            with self.assertRaises(ValueError):concurrent.submit_once("11111111-1","one","11111111-1","demo",Timeout())

    def test_certification_soap_contract(self):
        def reply(operation, fields):
            raw="<RESPUESTA>"+fields+"</RESPUESTA>"
            return f"<Envelope><Body><{operation}Return>{escape(raw)}</{operation}Return></Body></Envelope>".encode()
        def fake(method,url,headers,body=None):
            self.assertEqual(method,"POST")
            self.assertTrue(url.startswith("https://maullin.sii.cl/DTEWS/"))
            if url.endswith("CrSeed.jws"):
                return reply("getSeed","<ESTADO>00</ESTADO><SEMILLA>1234</SEMILLA>")
            if url.endswith("GetTokenFromSeed.jws"):
                self.assertIn(b"<pszXml",body)
                self.assertIn(b"1234",body)
                return reply("getToken","<ESTADO>00</ESTADO><TOKEN>demo</TOKEN>")
            self.assertIn(b"<RutCompania",body)
            return reply("getEstUp","<ESTADO>EPR</ESTADO>")
        adapter=SiiDirect(request=fake)
        token=adapter.authenticate(33,lambda seed:seed.encode())
        self.assertEqual(adapter.status(33,"11111111-1","123",token)["code"],"EPR")

    def test_status_and_public_boleta(self):
        if not schema(39):self.skipTest("Requiere XSD de boleta")
        d,a=fixture(39);xml,_,_=build(d,**a)
        with tempfile.TemporaryDirectory() as tmp:
            ledger=Ledger(Path(tmp,"qa.sqlite"))
            ledger.reserve("11111111-1",39,"one","sale/1","digest",101,103)
            ledger.stage("11111111-1","one",xml,a["cert"],schema(39))
            def fake(method,url,headers,body=None):
                if method=="POST":
                    self.assertTrue(url.startswith("https://pangal.sii.cl/")); self.assertIn(xml,body)
                    return b'{"trackid":123,"estado":"REC"}'
                self.assertTrue(url.endswith("11111111-1-123"))
                return b'{"estado":"EPR"}'
            adapter=SiiDirect(request=fake)
            self.assertEqual(ledger.submit_once("11111111-1","one","11111111-1","demo",adapter)["state"],"RECEIVED")
            self.assertEqual(ledger.query_status("11111111-1","one","demo",adapter)["code"],"EPR")
            with self.assertRaises(ValueError):ledger.receipt_link("11111111-1","one")
            ledger.record_verified_status("11111111-1","one","123",101,"ACCEPTED","FIXTURE")
            self.assertEqual(ledger.lookup(ledger.receipt_link("11111111-1","one")),{"folio":101,"issue_date":"2026-11-25","total":11900})
            self.assertIsNone(ledger.lookup("bad"))
            with self.assertRaises(ValueError): SiiDirect("production")
            with self.assertRaises(RuntimeError): SiiDirect().authenticate(39,lambda _:b"")

if __name__=="__main__":unittest.main()
