import assert from "node:assert/strict";
import test from "node:test";
import { BIANCA_CANONICAL_CATALOG_LINKS, selectBiancaCommercialKnowledge } from "../features/connectors/whatsapp-cloud/bianca-commercial-knowledge.ts";

test("selects compact totem and photo format knowledge without treating totem as multiple products", () => {
  const context = selectBiancaCommercialKnowledge({ messageText: "Quiero cotizar un tótem y saber qué formatos tienen" });
  assert.match(context, /tótem = un equipo\/experiencia fotográfica/);
  assert.doesNotMatch(context, /varios tipos de tótem/);
  assert.match(context, /Classic: 5 × 15 cm, 3 fotos y 2 impresiones/);
  assert.match(context, /Polaroid: 7,5 × 10 cm y 2 impresiones/);
  assert.match(context, /cantidad de fotos no definida, no inventarla/);
  assert.doesNotMatch(context, /CLASSIC.*250\.000/);
});

test("Photo IA is current but explicitly not normalized", () => {
  const context = selectBiancaCommercialKnowledge({ messageText: "¿Cuánto cuesta Photo IA?" });
  assert.match(context, /PHOTO IA: oferta comercial vigente/);
  assert.match(context, /SERVICE REGISTRY STATUS = NOT NORMALIZED/);
  assert.match(context, /fuente comercial autorizada/);
  assert.doesNotMatch(context, /500\.000|190\.000/);
});

test("special quote services are fail-closed", () => {
  const context = selectBiancaCommercialKnowledge({ messageText: "¿Cuánto cuesta Instabox o Video Lounge?" });
  assert.match(context, /requieren cotización oficial/);
  assert.match(context, /no inventar precio ni disponibilidad/);
});

test("catalog context maps event intent to canonical links", () => {
  const context = selectBiancaCommercialKnowledge({ messageText: "Quiero ver los planes para mi matrimonio" });
  assert.match(context, /matrimonio\/novios → WEDDINGS/);
  assert.match(context, new RegExp(BIANCA_CANONICAL_CATALOG_LINKS.WEDDINGS.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
  assert.match(context, /solicita CATALOG_LOOKUP/);
});

test("generic turns do not receive the full catalog", () => {
  const context = selectBiancaCommercialKnowledge({ messageText: "Hola, ¿cómo estás?" });
  assert.match(context, /SIN CONTEXTO COMERCIAL ESPECIAL/);
  assert.doesNotMatch(context, /Classic:|Polaroid:|PHOTO IA|WEDDINGS=/);
});
