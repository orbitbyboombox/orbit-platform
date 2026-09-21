import assert from "node:assert/strict";
import test from "node:test";
import { SALES_QUALITY_CASES, summarizeBiancaSalesQuality } from "../features/connectors/whatsapp-cloud/bianca-sales-quality-eval.ts";
import { detectBiancaBuyingSignal } from "../features/connectors/whatsapp-cloud/bianca-commercial-planner.ts";

test("SALES_QUALITY_EVAL generates at least 500 multi-turn conversations", () => {
  assert.ok(SALES_QUALITY_CASES.length >= 500);
  assert.ok(SALES_QUALITY_CASES.every((scenario) => scenario.turns.length >= 2));
});

test("SALES_QUALITY_EVAL reaches the commercial quality gate", () => {
  const summary = summarizeBiancaSalesQuality();
  assert.equal(summary.total, 500);
  assert.ok(summary.passRate >= 0.95, JSON.stringify(summary));
  for (const metric of ["naturalness", "progressiveProfiling", "buyingSignals", "recommendations", "upsell", "objectionHandling", "closing", "repetitionGuard", "handoff", "unsupportedClaims", "overSelling"]) {
    assert.ok(Number(summary.metrics[metric]) >= 0.95, `${metric}: ${summary.metrics[metric]}`);
  }
});

test("quality evaluation keeps Shadow Mode and execution gates untouched", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../features/connectors/whatsapp-cloud/bianca-sales-quality-eval.ts", import.meta.url), "utf8");
  assert.match(source, /evaluateBiancaSalesQuality/);
  assert.doesNotMatch(source, /sendWhatsApp|createQuote|sendEmail|startReservation/);
});

test("buying signals resolve contextually and reject non-acceptance turns", () => {
  for (const text of ["me interesa", "me gusta", "dale", "hagámoslo", "avancemos", "quiero ese", "ese me sirve", "cómo reservo", "mándamelo", "ok vamos", "sí", "perfecto", "listo", "de una", "ya", "cerrémoslo"]) {
    assert.equal(detectBiancaBuyingSignal({ text, previousText: "La cotización y disponibilidad están listas", activeStep: "OFFER_RESERVATION" }), true, text);
  }
  for (const text of ["¿dale?", "me gusta pero ¿me haces descuento?", "cambiemos la fecha", "gracias", "no sé", "sí, ¿cuánto cuesta?"]) {
    assert.equal(detectBiancaBuyingSignal({ text, previousText: "La cotización está lista", activeStep: "OFFER_RESERVATION" }), false, text);
  }
  assert.equal(detectBiancaBuyingSignal({ text: "avancemos ¿te parece?", previousText: "La propuesta está lista", activeStep: "OFFER_RESERVATION" }), true);
});
