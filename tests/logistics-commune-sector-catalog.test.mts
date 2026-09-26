import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalCommuneName,
  defaultSectorForCommune,
  normalizeCommune,
  REGION_METROPOLITANA_COMMUNE_CATALOG,
} from "../features/resources/logistics-commune-catalog.ts";

test("RM logistics catalog is complete and canonical", () => {
  assert.equal(REGION_METROPOLITANA_COMMUNE_CATALOG.length, 52);
  assert.equal(canonicalCommuneName("Nunoa"), "Ñuñoa");
  assert.equal(canonicalCommuneName("Chicureo"), "Colina");
  assert.equal(normalizeCommune("San José de Maipo"), "san jose de maipo");
  assert.equal(defaultSectorForCommune("Ñuñoa"), "CENTRO");
  assert.equal(defaultSectorForCommune("Melipilla"), "OTROS");
});
