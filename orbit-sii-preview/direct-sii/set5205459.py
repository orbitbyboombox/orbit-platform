"""Casos asignados a ORBIT por el SII. Valores en pesos chilenos."""
from copy import deepcopy


def line(name, quantity, price, discount=0, exempt=False):
    return dict(name=name, quantity=quantity, amount=price, discount_pct=discount, exempt=exempt)


def cases():
    first = [line("Cajón AFECTO", 148, 2327), line("Relleno AFECTO", 63, 3847)]
    second = [line("Pañuelo AFECTO", 521, 4086, 7), line("ITEM 2 AFECTO", 458, 3143, 15)]
    third = [line("Pintura B&W AFECTO", 39, 4766), line("ITEM 2 AFECTO", 197, 3461),
             line("ITEM 3 SERVICIO EXENTO", 1, 35026, exempt=True)]
    fourth = [line("ITEM 1 AFECTO", 263, 3995), line("ITEM 2 AFECTO", 112, 4577),
              line("ITEM 3 SERVICIO EXENTO", 2, 6803, exempt=True)]
    returned = deepcopy(second)
    returned[0]["quantity"], returned[1]["quantity"] = 191, 310
    return [
        dict(kind=33, lines=first),
        dict(kind=33, lines=second),
        dict(kind=33, lines=third),
        dict(kind=33, lines=fourth, global_discount_pct=15),
        dict(kind=61, lines=[], target=1, code=2, reason="CORRIGE GIRO DEL RECEPTOR"),
        dict(kind=61, lines=returned, target=2, code=3, reason="DEVOLUCION DE MERCADERIAS"),
        dict(kind=61, lines=deepcopy(third), target=3, code=1, reason="ANULA FACTURA"),
        dict(kind=56, lines=[], target=5, code=1, reason="ANULA NOTA DE CREDITO ELECTRONICA"),
    ]


# tipo SII, folio, monto exento, base afecta, tratamiento
PURCHASES = (
    (30, 234, 0, 25878, "credito"),
    (33, 32, 9100, 7236, "credito"),
    (30, 781, 0, 29841, "uso_comun"),
    (60, 451, 0, 2749, "descuento_234"),
    (33, 67, 0, 10328, "entrega_gratuita"),
    (46, 9, 0, 9726, "retencion_total"),
    (60, 211, 0, 5123, "descuento_32"),
)
