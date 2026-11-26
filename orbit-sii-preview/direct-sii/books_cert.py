"""Libros de certificación IECV. Los importes por tipo se declaran en positivo."""
from collections import defaultdict

from motor import E, SII, nodes, percentage, put, signature, verify_generated, wire
from set5205459 import PURCHASES


def purchase_rows(day):
    # Contrapartes sintéticas para validación estructural local.
    counterparties = {234: "11111111-1", 32: "22222222-2", 781: "33333333-3",
                      67: "44444444-4", 9: "55555555-5"}
    for kind, folio, exempt, net, treatment in PURCHASES:
        vat = percentage(net, 19)
        target = {"descuento_234": (30, 234), "descuento_32": (33, 32)}.get(treatment)
        row = dict(kind=kind, folio=folio, day=day, rut=counterparties[target[1] if target else folio],
                   net=net, exempt=exempt, vat=vat, total=net + exempt + vat, target=target,
                   name=f"Proveedor de laboratorio {target[1] if target else folio}")
        if treatment == "uso_comun":
            row.update(vat=0, common=vat)
        if treatment == "entrega_gratuita":
            row.update(vat=0, nonrecoverable=vat)
        if treatment == "retencion_total":
            row.update(retention=vat, total=net)
        yield row


def build_book(operation, attention, docs, issuer, signer, day, key, cert):
    root = E.Element(E.QName(SII, "LibroCompraVenta"), nsmap={None: SII}, version="1.0")
    body = put(root, "EnvioLibro", ID=f"IECV-{attention}")
    nodes(put(body, "Caratula"), (("RutEmisorLibro", issuer), ("RutEnvia", signer),
          ("PeriodoTributario", day[:7]), ("FchResol", "2026-10-01"), ("NroResol", 0),
          ("TipoOperacion", operation), ("TipoLibro", "ESPECIAL"), ("TipoEnvio", "TOTAL"),
          ("FolioNotificacion", 1 if operation == "VENTA" else 2)))
    groups = defaultdict(list)
    for row in docs:
        groups[row["kind"]].append(row)
    summary = put(body, "ResumenPeriodo")
    for kind, group in sorted(groups.items()):
        subtotal = put(summary, "TotalesPeriodo")
        def total(field):
            return sum(row.get(field, 0) for row in group)
        nodes(subtotal, (("TpoDoc", kind), ("TotDoc", len(group)), ("TotMntExe", total("exempt")),
                         ("TotMntNeto", total("net")), ("TotMntIVA", total("vat"))))
        if total("nonrecoverable"):
            nodes(put(subtotal, "TotIVANoRec"), (("CodIVANoRec", 4), ("TotOpIVANoRec", 1),
                  ("TotMntIVANoRec", total("nonrecoverable"))))
        if total("common"):
            nodes(subtotal, (("TotOpIVAUsoComun", 1), ("TotIVAUsoComun", total("common")),
                  ("FctProp", "0.60"), ("TotCredIVAUsoComun", percentage(total("common"), 60))))
        if total("retention"):
            nodes(subtotal, (("TotOpIVARetTotal", 1), ("TotIVARetTotal", total("retention"))))
        put(subtotal, "TotMntTotal", total("total"))
    for row in docs:
        detail = put(body, "Detalle")
        put(detail, "TpoDoc", row["kind"])
        if row.get("retention"):
            put(detail, "IndFactCompra", 1)
        nodes(detail, (("NroDoc", row["folio"]), ("TpoImp", 1), ("TasaImp", 19),
                       ("FchDoc", row["day"]), ("RUTDoc", row["rut"])))
        if row.get("name"):
            put(detail, "RznSoc", row["name"])
        if operation == "VENTA" and row.get("target") and row.get("reference_code") == 1 and row["kind"] == 61:
            nodes(detail, zip(("TpoDocRef", "FolioDocRef"), row["target"]))
        nodes(detail, (("MntExe", row["exempt"]), ("MntNeto", row["net"]), ("MntIVA", row["vat"])))
        if row.get("nonrecoverable"):
            nodes(put(detail, "IVANoRec"), (("CodIVANoRec", 4), ("MntIVANoRec", row["nonrecoverable"])))
        if row.get("common"):
            put(detail, "IVAUsoComun", row["common"])
        if row.get("retention"):
            put(detail, "IVARetTotal", row["retention"])
        put(detail, "MntTotal", row["total"])
    put(body, "TmstFirma", day + "T12:01:00")
    signature(root, body, key, cert)
    xml = wire(root, declaration=True)
    verify_generated(xml, cert, expected_count=1)
    return xml
