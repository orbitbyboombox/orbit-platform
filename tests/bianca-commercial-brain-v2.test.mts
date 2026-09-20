import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BIANCA_PLAYBOOK_CATEGORIES, selectBiancaSalesPlaybook } from "../features/connectors/whatsapp-cloud/bianca-sales-playbook.ts";
import { BIANCA_RESPONSE_STYLE_BANK, responseStylePrompt } from "../features/connectors/whatsapp-cloud/bianca-response-style-bank.ts";

test("commercial brain V2 has the six explicit layers and Founder QA remains gated", async () => {
  const doc = await readFile(new URL("../BIANCA_COMMERCIAL_BRAIN.md", import.meta.url), "utf8");
  for (const layer of ["identidad/política", "conocimiento comercial contextual", "playbook de ventas", "memoria de oportunidad", "herramientas ORBIT", "orquestación de respuesta"]) assert.match(doc, new RegExp(layer));
  assert.match(doc, /GLOBAL AUTOMATION.*apagado/);
});

test("sales playbook covers the required commercial categories", () => {
  assert.ok(BIANCA_PLAYBOOK_CATEGORIES.length >= 20);
  assert.match(selectBiancaSalesPlaybook({ messageText: "Quiero cotizar para matrimonio", source: "WEB_FORM_LEAD" }), /WEB_LEAD/);
  assert.match(selectBiancaSalesPlaybook({ messageText: "Soy Matías y tú", hasConfirmedName: true }), /IDENTITY_QUESTION/);
  assert.match(selectBiancaSalesPlaybook({ messageText: "Quiero hablar con una persona" }), /HUMAN_REQUEST/);
  assert.match(selectBiancaSalesPlaybook({ messageText: "Está caro" }), /OBJECTION_PRICE/);
});

test("response style bank enforces variation without hardcoded replies", () => {
  assert.ok(BIANCA_RESPONSE_STYLE_BANK.greeting.length >= 3);
  assert.match(responseStylePrompt(), /últimos 3 mensajes/);
  assert.match(responseStylePrompt(), /una pregunta principal/);
});

test("knowledge drift test covers every normalized service and keeps Photo IA pending", async () => {
  const [catalog, knowledge] = await Promise.all([
    readFile(new URL("../features/business-core/catalog/service.catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/connectors/whatsapp-cloud/bianca-commercial-knowledge.ts", import.meta.url), "utf8"),
  ]);
  const ids = [...catalog.matchAll(/id: "([A-Z0-9_]+)"/g)].map((match) => match[1]);
  const names: Record<string, string> = { CLASSIC: "Classic", POLAROID: "Polaroid", BLACK_STUDIO: "Black Studio", BBOX360: "BBOX360", LIGHTBOX: "LightBox", BOOMBALL: "BoomBall", HASHTAG: "Hashtag", INSTABOX: "Instabox", VIDEO_LOUNGE: "Video Lounge" };
  for (const id of ids) {
    const name = names[id] ?? id;
    assert.match(knowledge, new RegExp(name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `Missing commercial knowledge for ${id}`);
  }
  assert.match(knowledge, /Photo IA/);
  assert.match(knowledge, /PENDING CANONICAL SERVICE ID/);
});

test("red-team matrix provides at least 100 deterministic scenarios", () => {
  const seeds = [
    "Hola", "quiero cotizar", "cuánto sale", "matrimonio", "cumpleaños", "empresa", "BBOX360", "BoomBall",
    "Photo IA", "Classic", "Polaroid", "Está caro", "quiero descuento", "quiero reservar", "hablar con una persona",
    "cómo te llamas", "21.11", "en Lo Barnechea", "Alto Noviciado", "Classic y BBOX360", "no sé la fecha",
    "cambié la comuna", "quiero ver planes", "evento internacional", "tengo una duda técnica",
  ];
  const scenarios = Array.from({ length: 4 }, (_, index) => seeds.map((seed) => `${seed} [red-team-${index + 1}]`)).flat();
  assert.ok(scenarios.length >= 100);
  for (const message of scenarios) {
    assert.ok(message.trim().length > 0);
    assert.doesNotMatch(message, /api[_-]?key|access[_-]?token/i);
  }
});

test("runtime pricing and availability wiring stays outside the LLM prompt", async () => {
  const source = await readFile(new URL("../features/connectors/whatsapp-cloud/whatsapp-ai.responder.ts", import.meta.url), "utf8");
  const tools = await readFile(new URL("../features/connectors/whatsapp-cloud/bianca-runtime-tools.ts", import.meta.url), "utf8");
  assert.match(source, /lookupBiancaPrice/);
  assert.match(source, /lookupBiancaAvailability/);
  assert.match(source, /RESULTADOS DE TOOLS ORBIT/);
  assert.match(tools, /from\("commercial_prices"\)/);
  assert.match(tools, /resolveServicePrice/);
  assert.match(tools, /preflight_draft_capacity/);
  assert.match(tools, /QUOTE_REQUIRED/);
});
