"""Genera muestras offline. El CAF y ambas llaves se generan para cada muestra."""
import json
from pathlib import Path
import sys

from motor import build, validate
from test_motor import fixture, sample_bundle, schema


def generate_samples(output):
    output.mkdir(parents=True, exist_ok=True)
    issuer = {
        "rut": "76565272-3",
        "name": "PRODUCCIONES BOOM BOX COMPANY SPA",
        "activity": "Producción de todo tipo de eventos, transporte de carga por carretera",
        "activity_code": 932909,
        "address": "Puerta Oriente 361, of. 310 C, torre C",
        "city": "Colina",
    }
    for kind in (33, 39, 61):
        doc, args = fixture(kind, issuer_rut=issuer["rut"])
        doc.update(issuer=issuer, discount=0, payment_label="Contado")
        doc["receiver"].update(name="Cliente de demostración", address="Dirección de prueba 123",
                               city="Santiago", activity="Servicios de demostración")
        doc["lines"] = [
            {"name": "Servicio Cabina Fotográfica Classic (3 horas)", "amount": 400000},
            {"name": "Álbum de Firmas", "amount": 50000},
            {"name": "Traslado Comercial (Prov. Santiago)", "amount": 35000},
        ]
        if kind == 61:
            doc["reference"] = {"kind": 33, "folio": 101, "date": doc["date"],
                                "reason": "Anulación de factura de prueba", "total": 577150}
        xml, ted, amounts = build(doc, **args)
        validate(xml, schema(kind))
        bundle = sample_bundle(doc, ted, amounts)
        bundle["issuer"].update({
            "rut": "76.565.272-3", "activity": issuer["activity"], "address": issuer["address"],
            "city": issuer["city"], "office": "Santiago Norte", "email": "contacto@bbox.cl",
            "website": "www.bbox.cl",
        })
        (output / f"{kind}.json").write_text(json.dumps(bundle), encoding="utf-8")
        (output / f"{kind}.xml").write_bytes(xml)


if __name__ == "__main__":
    generate_samples(Path(sys.argv[1]))
