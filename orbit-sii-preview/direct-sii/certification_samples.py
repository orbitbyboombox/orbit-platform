"""Construye un expediente reproducible sin red ni folios del SII."""
from collections import Counter
from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import sys

from books_cert import build_book, purchase_rows
from motor import DS, SII, build, calculate, nodes, parse, put, signature, validate, verify_generated, wire
from set5205459 import cases
from test_motor import fixture, sample_bundle

ISSUER = dict(rut="76565272-3", name="PRODUCCIONES BOOM BOX COMPANY SPA",
              activity="Producción de todo tipo de eventos, transporte de carga por carretera",
              activity_code=932909, address="Puerta Oriente 361, of. 310 C, torre C", city="Colina")
MOCK_RECEIVERS = ["11111111-1", "22222222-2", "33333333-3", "44444444-4"]


def build_set(output, dte_schema, book_schema):
    output.mkdir(parents=True, exist_ok=False)
    completed, envelopes, tenders, sales = {}, [], [], []
    serials = Counter()
    common_args = None
    for index, case in enumerate(cases(), 1):
        kind = case["kind"]
        name = f"5205459-{index}"
        doc, args = fixture(kind, issuer_rut=ISSUER["rut"])
        if common_args is None:
            common_args = args
        else:
            args.update(key=common_args["key"], cert=common_args["cert"])
        serials[kind] += 1
        doc.update({**case, "issuer": ISSUER, "test_case": name, "discount": 0, "folio": 100 + serials[kind]})
        target = case.get("target")
        if target:
            original, amount = completed[target]
            doc["receiver"] = deepcopy(original["receiver"])
            doc["reference"] = dict(kind=original["kind"], folio=original["folio"], date=original["date"],
                                    total=amount["total"], reason=case["reason"], code=case["code"])
            if case["code"] == 2:
                doc["receiver"]["activity"] = "Giro corregido de laboratorio"
        else:
            doc["receiver"].update(rut=MOCK_RECEIVERS[index-1], name=f"Receptor de laboratorio {index}")
        xml, ted, amounts = build(doc, **args)
        validate(xml, dte_schema)
        envelopes.append(parse(xml))
        tenders.append(ted)
        (output / f"{name}-LOCAL.xml").write_bytes(xml)
        completed[index] = (doc, amounts)
        sales.append(dict(kind=kind, folio=doc["folio"], day=doc["date"], rut=doc["receiver"]["rut"],
                          net=amounts["net"], exempt=amounts.get("exempt", 0), vat=amounts["iva"],
                          total=amounts["total"], reference_code=case.get("code"), target=(original["kind"], original["folio"]) if target else None))
        bundle = sample_bundle(doc, ted, amounts)
        bundle["issuer"].update(rut="76.565.272-3", activity=ISSUER["activity"], address=ISSUER["address"],
                                city=ISSUER["city"], office="Santiago Norte",
                                email="contacto@bbox.cl", website="www.bbox.cl")
        rows, _, discount = calculate(doc)
        bundle["document"]["snapshot"].update(
            lines=[dict(name=r["name"], quantity=r["quantity"], unitPrice=r["amount"], net=r["line_total"],
                        discountPct=r["discount_pct"], discountValue=r["discount_value"], exempt=r.get("exempt"))
                   for r in rows] or [dict(name=case["reason"], textOnly=True, net=0)],
            exempt=amounts.get("exempt", 0), discount=discount, globalDiscountPct=doc.get("global_discount_pct"))
        for copy in (("TRIBUTARIO", "CEDIBLE") if kind == 33 else ("TRIBUTARIO",)):
            bundle["document"]["copy"] = copy
            bundle_path = output / f"{name}-{copy}.json"
            bundle_path.write_text(json.dumps(bundle), encoding="utf-8")
            subprocess.run(["node", str(Path(__file__).with_name("pdf417.mjs")),
                            str(bundle_path), str(output / f"{name}-{copy}.pdf")], check=True)
            bundle_path.unlink()
    root = envelopes[0]
    batch = root.find(f"{{{SII}}}SetDTE")
    batch.set("ID", "SET-5205459-LOCAL")
    cover = batch.find(f"{{{SII}}}Caratula")
    cover.remove(cover.find(f"{{{SII}}}SubTotDTE"))
    for kind, count in sorted(serials.items()):
        nodes(put(cover, "SubTotDTE"), (("TpoDTE", kind), ("NroDTE", count)))
    for envelope in envelopes[1:]:
        batch.append(envelope.find(f".//{{{SII}}}DTE"))
    root.remove(root.find(f"{{{DS}}}Signature"))
    signature(root, batch, common_args["key"], common_args["cert"])
    xml = wire(root, declaration=True)
    # La serialización XML resuelve las entidades numéricas de los timbres.
    # Restaurar los bytes de cada DD firmado mantiene sus firmas verificables.
    restored, offset = [], 0
    for ted in tenders:
        start = xml.index(b'<TED version="1.0">', offset)
        end = xml.index(b"</TED>", start) + len(b"</TED>")
        restored.extend((xml[offset:start], ted))
        offset = end
    xml = b"".join([*restored, xml[offset:]])
    validate(xml, dte_schema)
    verify_generated(xml, common_args["cert"], expected_count=9)
    (output / "5205459-EnvioDTE-LOCAL.xml").write_bytes(xml)
    day = completed[1][0]["date"]
    purchases = list(purchase_rows(day))
    for operation, attention, rows in (("VENTA", 5205460, sales), ("COMPRA", 5205461, purchases)):
        xml = build_book(operation, attention, rows, ISSUER["rut"], ISSUER["rut"],
                         day, common_args["key"], common_args["cert"])
        validate(xml, book_schema)
        (output / f"{attention}-Libro-{operation}-LOCAL.xml").write_bytes(xml)
    return sales, purchases


if __name__ == "__main__":
    print(json.dumps(build_set(Path(sys.argv[1]), os.environ["ORBIT_XSD_DTE"], os.environ["ORBIT_XSD_IECV"]), indent=2))
