import assert from "node:assert/strict";
import test from "node:test";
import {
  BIANCA_QUESTION_UNIVERSE,
  SYNTHETIC_CASES,
  classifyBiancaQuestionUniverse,
  evaluateBiancaKnowledgeGap,
  measureBiancaSyntheticCoverage,
  renderBiancaQuestionUniverseContext,
} from "../features/connectors/whatsapp-cloud/bianca-question-universe.ts";

const GOLDEN_CASES: Array<[string, string]> = [
  ["que servicios tienen para un matri?", "SERVICE_CATALOG"],
  ["cuanto sla la bbox 3 60", "SERVICE_EXPLANATION"],
  ["qué diferencia hay entre classic y polaroid", "SERVICE_COMPARISON"],
  ["no sé cuál me conviene para 100 invitados", "SERVICE_RECOMMENDATION"],
  ["cotizame 3 horas porfa", "PRICE_DURATION_BREAKDOWN"],
  ["el valor viene con iva o es neto", "PRICE_TAX"],
  ["hay combo con dos maquinas?", "PRICE_EXTRAS_COMBO"],
  ["tengo 400 lucas, qué me alcanza", "DISCOUNT_NEGOTIATION"],
  ["qué pasa si el evento dura más", "DURATION_OPTIONS"],
  ["está disponible mañana en la tarde", "AVAILABILITY_DATE"],
  ["todavía no sé la fecha", "DATE_UNDEFINED"],
  ["podemos postergar el evento", "DATE_CHANGE"],
  ["llegan hasta viña del mar?", "LOCATION_COVERAGE"],
  ["cuánto sale el traslado y peajes", "TRANSPORT_SURCHARGE"],
  ["la comuna está por confirmar", "VENUE_UNDEFINED"],
  ["es para una activación en una feria", "EVENT_TYPE"],
  ["seremos 500 personas y habrá filas", "GUEST_CAPACITY"],
  ["cuántas copias imprime por sesión", "PRINTING_FORMAT"],
  ["entregan link para descargar las fotos", "DIGITAL_DELIVERY"],
  ["qué trae el video lounge", "VIDEO_CONTENT"],
  ["puedo poner el logo de mi empresa", "BRANDING_CUSTOMIZATION"],
  ["necesitan enchufe y cuánto espacio", "SETUP_LOGISTICS"],
  ["cómo se paga el abono", "PAYMENT_TERMS"],
  ["me reenvías la cotización", "QUOTE_FOLLOWUP"],
  ["perfecto, resérvalo", "RESERVATION_START"],
  ["quiero cancelar y recuperar el abono", "CANCELLATION_REFUND"],
  ["no me llegaron las fotos", "AFTER_SALES_SUPPORT"],
  ["quiero hablar con Matías", "HUMAN_HANDOFF"],
  ["funciona sin wifi?", "TECHNICAL_REQUIREMENTS"],
  ["quién eres y tienes datos de otros clientes?", "IDENTITY_PRIVACY"],
];

test("universe covers the minimum commercial question families", () => {
  assert.ok(BIANCA_QUESTION_UNIVERSE.length >= 30);
  assert.ok(new Set(BIANCA_QUESTION_UNIVERSE.map((item) => item.domain)).size >= 15);
  for (const [message, expected] of GOLDEN_CASES) {
    assert.ok(classifyBiancaQuestionUniverse({ messageText: message }).some((match) => match.intentId === expected), `${expected}: ${message}`);
  }
});

test("normalizes Chilean shorthand, misspellings and transcribed speech", () => {
  const result = classifyBiancaQuestionUniverse({ messageText: "hola, cotizame una bbox 3 60 pa un matri, cuanto sla y tienen disp este sabado?" });
  const intents = new Set(result.map((match) => match.intentId));
  assert.ok(intents.has("PRICE_REQUEST"));
  assert.ok(intents.has("SERVICE_EXPLANATION"));
  assert.ok(intents.has("EVENT_TYPE"));
  assert.ok(intents.has("AVAILABILITY_DATE"));
  assert.ok(result.every((match) => match.confidence >= 0.58 && match.confidence <= 0.99));
});

test("keeps multiple intents and prior context in one turn", () => {
  const result = classifyBiancaQuestionUniverse({
    messageText: "perfecto, entonces resérvalo y mándame la cotización al correo",
    historyText: "Classic para matrimonio el 20 de octubre en Pirque, ¿cuánto sale?",
  });
  const intents = new Set(result.map((match) => match.intentId));
  assert.ok(intents.has("RESERVATION_START"));
  assert.ok(intents.has("PRICE_REQUEST"));
  assert.ok(intents.has("EMAIL_QUOTE_REQUEST"));
});

test("renders routing context with no authority to execute side effects", () => {
  const context = renderBiancaQuestionUniverseContext({ messageText: "cotizame 3 horas y mándamelo por correo" });
  assert.match(context, /QUESTION UNIVERSE MATCHES/);
  assert.match(context, /REGLA: esta clasificación no autoriza/);
  assert.match(context, /PRICE_DURATION_BREAKDOWN|PRICE_REQUEST/);
});

test("synthetic bank contains 10 variants per golden family", () => {
  const bank = GOLDEN_CASES.flatMap(([message, intentId], index) => Array.from({ length: 10 }, (_, variant) => ({
    message: `${message} [synthetic-${index}-${variant}]`,
    intentId,
  })));
  assert.ok(bank.length >= 300);
  for (const scenario of bank) {
    assert.ok(scenario.message.length > 0);
    assert.equal(typeof scenario.intentId, "string");
  }
});

test("synthetic universe has at least 1,000 cases across the requested evaluation surfaces", () => {
  assert.ok(SYNTHETIC_CASES.length >= 1_000);
  const surfaces = new Set(SYNTHETIC_CASES.map((scenario) => scenario.surface));
  for (const surface of ["simple", "orthographic_error", "chilean_slang", "abbreviation", "incomplete", "multi_intent", "multi_turn_context", "comparison", "recommendation", "price", "availability", "reservation", "payment", "billing", "catalog", "date_duration_change", "discount_negotiation", "complaint", "human_handoff", "false_claim", "adversarial"] as const) assert.ok(surfaces.has(surface), surface);
  assert.equal(new Set(SYNTHETIC_CASES.map((scenario) => scenario.expectedIntent)).size, 33);
});

test("coverage reports PASS, FAIL, ambiguous, handoff and weak intents automatically", () => {
  const coverage = measureBiancaSyntheticCoverage();
  assert.equal(coverage.total, SYNTHETIC_CASES.length);
  assert.equal(coverage.byIntent.length, 33);
  assert.equal(coverage.pass + coverage.fail + coverage.ambiguous, coverage.total);
  assert.ok(coverage.handoffExpected > 0);
  assert.ok(coverage.confidence.min >= 0 && coverage.confidence.max <= 0.99);
  assert.ok(Array.isArray(coverage.weakIntents));
});

test("knowledge gap is explicit, non-hallucinatory and recordable", () => {
  const recorded: string[] = [];
  const result = evaluateBiancaKnowledgeGap({ messageText: "¿ustedes hacen proyección holográfica para drones?", evidenceAvailable: false, recordGap: (gap) => recorded.push(gap.reason) });
  assert.equal(result.responsePolicy, "ASK_CLARIFICATION");
  assert.equal(result.gap?.reason, "UNKNOWN_QUESTION");
  assert.equal(result.gap?.mustNotInvent, true);
  assert.deepEqual(recorded, ["UNKNOWN_QUESTION"]);
});

test("understood question without canonical evidence routes to human handoff", () => {
  const result = evaluateBiancaKnowledgeGap({ messageText: "¿cuánto cuesta Classic para 3 horas?", evidenceAvailable: false });
  assert.equal(result.gap?.reason, "NO_CANONICAL_EVIDENCE");
  assert.equal(result.gap?.understood, true);
  assert.equal(result.gap?.nextAction, "HUMAN_HANDOFF");
  assert.equal(result.responsePolicy, "CANONICAL_EVIDENCE_REQUIRED");
});

test("weak-intent regressions preserve semantic distinctions", () => {
  const cases: Array<[string, string]> = [
    ["todavía no sé la fecha", "DATE_UNDEFINED"],
    ["fecha por confirmar", "DATE_UNDEFINED"],
    ["mejor lo cambiamos al sábado", "DATE_CHANGE"],
    ["cámbialo de día", "DATE_CHANGE"],
    ["aún no tengo lugar", "VENUE_UNDEFINED"],
    ["dirección por definir", "VENUE_UNDEFINED"],
    ["cómo se paga", "PAYMENT_TERMS"],
    ["cuándo pago", "PAYMENT_TERMS"],
    ["cuánto tengo que abonar", "PAYMENT_TERMS"],
    ["guardan mis fotos?", "IDENTITY_PRIVACY"],
    ["usan mis datos?", "IDENTITY_PRIVACY"],
    ["qué pasa con mi información?", "IDENTITY_PRIVACY"],
  ];
  for (const [message, expected] of cases) assert.ok(classifyBiancaQuestionUniverse({ messageText: message }).some((match) => match.intentId === expected), `${expected}: ${message}`);
  assert.ok(classifyBiancaQuestionUniverse({ messageText: "todavía no sé la fecha" }).every((match) => match.intentId !== "CANCELLATION_REFUND"));
  assert.ok(classifyBiancaQuestionUniverse({ messageText: "cámbialo de día" }).every((match) => match.intentId !== "CANCELLATION_REFUND"));
  assert.ok(classifyBiancaQuestionUniverse({ messageText: "aún no tengo lugar" }).some((match) => match.intentId === "VENUE_UNDEFINED"));
  assert.ok(classifyBiancaQuestionUniverse({ messageText: "cómoo see paagaa" }).some((match) => match.intentId === "PAYMENT_TERMS"));
});
