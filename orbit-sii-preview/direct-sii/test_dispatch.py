import os
import unittest

from motor import build, validate, verify_generated, verify_ted
from test_motor import fixture

class DispatchTests(unittest.TestCase):
    def test_equipment_without_sale(self):
        document, keys = fixture(52)
        document["discount"] = 0
        document["lines"] = [{"name":"Tótem de prueba", "quantity":2}, {"name":"CASE de prueba","quantity":1}]
        document["transport"] = dict(movement=6, plate="AA0001", carrier_rut="11111111-1",
                                     driver_rut="22222222-2", driver_name="Chofer de prueba",
                                     address="Calle de prueba 100", city="Santiago")
        xml, ted, totals = build(document, **keys)
        self.assertEqual(totals, {"net":0,"iva":0,"total":0})
        self.assertNotIn(b"<PrcItem>", xml)
        self.assertIn(b"<IndTraslado>6</IndTraslado>", xml)
        self.assertIn(b"<Patente>AA0001</Patente>", xml)
        self.assertIn(b"<QtyItem>2</QtyItem>", xml)
        self.assertIn(b"<MntTotal>0</MntTotal>", xml)
        verify_generated(xml, keys["cert"])
        verify_ted(ted, keys["anchor"])
        if os.getenv("ORBIT_XSD_DTE"):
            validate(xml, os.environ["ORBIT_XSD_DTE"])
        for field in ("plate","driver_rut","address"):
            bad = {**document, "transport":{**document["transport"],field:""}}
            with self.assertRaises(ValueError):
                build(bad, **keys)
