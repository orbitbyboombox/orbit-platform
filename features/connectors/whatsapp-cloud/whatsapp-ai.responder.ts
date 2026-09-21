import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { NovaChannelInput, NovaChannelOutput, NovaNextAction } from "@/features/nova-channel";
import { buildBiancaWebLeadPrompt, normalizeBiancaWebLeadContext } from "./bianca-web-lead-context.ts";
import { selectBiancaSalesPlaybook } from "./bianca-sales-playbook";
import { responseStylePrompt } from "./bianca-response-style-bank";
import { inferServiceCodes, lookupBiancaAvailability, lookupBiancaPrice } from "./bianca-runtime-tools";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NovaResponder } from "@/features/nova-channel/engine/nova-responder";
import { NovaChannelEngine } from "@/features/nova-channel";
import { BIANCA_INTRODUCTION, founderRequestResponse, isFounderRequest, officialSalesHandoffCopy } from "./bianca-policy";
import { selectBiancaCommercialKnowledge } from "./bianca-commercial-knowledge";
import { isNewBiancaCommercialOpportunity } from "./bianca-opportunity-context";
import { planBiancaTurn } from "./bianca-commercial-planner";
import { biancaFastPath } from "./bianca-fast-path.ts";

const INTENTS = [
  "CONSULTA_GENERAL",
  "CONSULTA_PRECIO",
  "OBJECION_PRECIO",
  "QUIERE_COTIZAR",
  "ENTREGA_DATOS",
  "CORRECCION_DATO",
  "CLIENTE_ENVIARA_MAS_DATOS",
  "DISPONIBILIDAD",
  "RECOMENDACION",
  "COMPARACION_SERVICIOS",
  "EVENTO_EMPRESA",
  "COTIZACION_ESPECIAL",
  "SEGUIMIENTO_COTIZACION",
  "MODIFICAR_COTIZACION",
  "CLIENTE_QUIERE_RESERVAR",
  "PAGO",
  "HABLAR_CON_PERSONA",
  "RECLAMO_O_PROBLEMA",
  "PROVEEDOR_O_NO_CLIENTE",
  "SPAM_O_MENSAJE_IRRELEVANTE",
] as const;

const FIELD_NAMES = [
  "name",
  "company",
  "email",
  "eventType",
  "eventName",
  "eventDate",
  "alternateDate",
  "startTime",
  "endTime",
  "durationHours",
  "commune",
  "address",
  "venue",
  "city",
  "region",
  "attendees",
  "estimatedServiceUsers",
  "indoorOutdoor",
  "requestedService",
  "secondaryServices",
  "specialRequirements",
] as const;

const aiDecisionSchema = z.object({
  responseText: z.string().min(1).max(900),
  commercialStage: z.enum([
    "NEW_LEAD",
    "QUALIFYING",
    "QUOTING",
    "QUOTE_SENT",
    "RESERVATION_INTENT",
    "RESERVATION_STARTED",
    "FOLLOW_UP",
    "HUMAN_REQUIRED",
    "CLOSED_WON",
    "CLOSED_LOST",
  ]),
  intents: z.array(z.enum(INTENTS)).max(6),
  waitForMoreData: z.boolean(),
  requestedAction: z.enum([
    "NONE",
    "COMMERCIAL_LOOKUP",
    "CATALOG_LOOKUP",
    "MANUAL_REVIEW",
    "WAIT_FOR_CUSTOMER",
    "HUMAN_HANDOFF",
  ]),
  catalogCategory: z.enum(["NONE", "WEDDINGS", "EVENTS", "COMPANIES"]),
  fields: z.array(z.object({
    field: z.enum(FIELD_NAMES),
    value: z.union([z.string(), z.number(), z.array(z.string())]),
    confidence: z.enum(["CONFIRMED", "APPROXIMATE", "INFERRED"]),
    correction: z.boolean(),
  })).max(24),
  conversationSummary: z.string().max(1200),
});

const aiHealthSchema = z.object({ ok: z.boolean() });

const openaiDirect = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

function resolveOpenAiDirectModel() {
  const providerMode = process.env.ORBIT_WHATSAPP_AI_PROVIDER?.trim().toLowerCase() || "openai-direct";
  if (providerMode !== "openai-direct") {
    throw new Error(`Unsupported WhatsApp AI provider: ${providerMode}`);
  }
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY_MISSING");
  const configuredModel = process.env.ORBIT_WHATSAPP_AI_MODEL?.trim() || "gpt-5-mini";
  const modelId = configuredModel.replace(/^openai\//i, "");
  if (!modelId) throw new Error("ORBIT_WHATSAPP_AI_MODEL is empty");
  return { configuredModel, model: openaiDirect(modelId) };
}

export interface WhatsAppAiHealthResult {
  AI_PROVIDER: string;
  AI_PROVIDER_REACHABLE: boolean;
  AI_MODEL: string;
  AI_GATEWAY_USED: boolean;
  GENERATE_OBJECT_SMOKE: boolean;
  HTTP_STATUS: number | null;
  ERROR_CODE: string | null;
  ERROR_TYPE: string | null;
  ERROR_MESSAGE: string | null;
}

function sanitizeAiDiagnostic(value: unknown) {
  if (typeof value !== "string") return null;
  return value
    .replace(/(?:api[_-]?key|authorization|bearer|token|secret)\s*[:=]\s*[^\s,}]+/gi, "[redacted]")
    .replace(/https?:\/\/[^\s)]+/gi, "[url-redacted]")
    .slice(0, 500);
}

function aiErrorDiagnostic(error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = error instanceof Error ? error.message : typeof record.message === "string" ? record.message : String(error);
  const statusValue = record.statusCode ?? record.status ?? (record.response && typeof record.response === "object" ? (record.response as Record<string, unknown>).status : null);
  const status = typeof statusValue === "number" && Number.isFinite(statusValue) ? statusValue : null;
  return {
    status,
    code: typeof record.code === "string" ? record.code : typeof record.errorCode === "string" ? record.errorCode : null,
    type: typeof record.type === "string" ? record.type : error instanceof Error ? error.name : null,
    message: sanitizeAiDiagnostic(message),
  };
}

/** Founder/Admin-only connectivity probe. It never sends a WhatsApp message. */
export async function runWhatsAppAiHealthCheck(): Promise<WhatsAppAiHealthResult> {
  try {
    const { configuredModel, model } = resolveOpenAiDirectModel();
    await generateObject({
      model,
      schema: aiHealthSchema,
      system: "Return only a valid health result.",
      prompt: "Return { ok: true }.",
    });
    return { AI_PROVIDER: "OpenAI Direct", AI_PROVIDER_REACHABLE: true, AI_MODEL: configuredModel, AI_GATEWAY_USED: false, GENERATE_OBJECT_SMOKE: true, HTTP_STATUS: null, ERROR_CODE: null, ERROR_TYPE: null, ERROR_MESSAGE: null };
  } catch (error) {
    const diagnostic = aiErrorDiagnostic(error);
    return { AI_PROVIDER: "OpenAI Direct", AI_PROVIDER_REACHABLE: false, AI_MODEL: process.env.ORBIT_WHATSAPP_AI_MODEL?.trim() || "gpt-5-mini", AI_GATEWAY_USED: false, GENERATE_OBJECT_SMOKE: false, HTTP_STATUS: diagnostic.status, ERROR_CODE: diagnostic.code, ERROR_TYPE: diagnostic.type, ERROR_MESSAGE: diagnostic.message };
  }
}

export type WhatsAppAiDecision = z.infer<typeof aiDecisionSchema>;

export interface WhatsAppConversationHistoryItem {
  direction: "INBOUND" | "OUTBOUND" | "SYSTEM";
  body: string;
  occurredAt: string;
}

const MASTER_INSTRUCTIONS = `
Eres BIANCA, Ejecutiva Comercial Digital de BOOMBOX, y atiendes WhatsApp de forma cercana, natural y humana.
Tu identidad siempre es BIANCA de BOOMBOX; nunca eres Matías, Founder ni una persona humana.
Tu trabajo es comprender, responder y estructurar información. NO eres una calculadora de precios ni una fuente de verdad comercial.

REGLAS DE CONVERSACIÓN:
- Lee toda la conversación antes de responder.
- Responde primero la pregunta directa del cliente y después pregunta solo lo mínimo que falte.
- Nunca vuelvas a pedir un dato que ya aparece en la conversación.
- Si el cliente envía varios datos juntos, aprovéchalos todos.
- Si corrige un dato, la corrección más reciente prevalece.
- Si dice que mandará más datos, que confirmará algo o que necesita un momento, no lo interrogues: espera de forma natural.
- Mensajes cortos, humanos, cálidos y profesionales; normalmente 1 a 4 líneas.
- Español natural de Chile, sin exagerar modismos ni parecer robot.
- En el primer contacto no empieces automáticamente con "Perfecto". Saluda de forma natural y varía la redacción; por ejemplo: "¡Hola! 😊 Sí, claro. Cuéntame qué tipo de evento estás organizando y la fecha, y te ayudo." o "¿Qué tipo de evento estás organizando y para qué fecha?". Preséntate como BIANCA solo cuando corresponda y no repitas la presentación después.
- Si no existe un nombre CONFIRMED en los datos estructurados o en la conversación, pregunta naturalmente "¿Con quién hablo?" (o una variante breve) antes de usar un nombre. Nunca trates profile_name o un nombre de WhatsApp como la forma preferida del cliente sin confirmación explícita.
- Si el cliente acaba de entregar un dato claro, úsalo para avanzar y no lo repitas como pregunta de confirmación. Confirma solo si hay ambigüedad, corrección, cierre de reserva o riesgo operativo.
- Haz como máximo 1 o 2 preguntas por mensaje; cuando sea posible, formula solo una pregunta principal. Usa dos solo si están directamente relacionadas y la respuesta sigue siendo natural. No interrogues con un formulario completo.
- Cada respuesta debe mover la conversación un paso comercial: obtener el dato mínimo que falta, recomendar, revisar disponibilidad, cotizar, iniciar reserva o hacer seguimiento.
- Alterna pregunta con valor: después de obtener uno o dos datos relevantes, entrega una recomendación, explica una opción o solicita CATALOG_LOOKUP para que el sistema entregue el catálogo/link canónico antes de continuar preguntando.
- Cuando corresponda compartir planes, solicita CATALOG_LOOKUP y usa exclusivamente el link canónico que entregue ORBIT; nunca escribas una URL inventada.
- Si llegan mensajes cortos consecutivos, intégralos con el historial y evita responder como si fueran conversaciones nuevas o bombardear con preguntas repetidas.
- Trata mensajes consecutivos del mismo cliente dentro de una misma ventana breve como un solo turno lógico. Si el primer mensaje es solo una confirmación ("Sí", "Dale", "Ok"), espera el siguiente contenido antes de responder.
- Una afirmación aislada no necesita un acuse automático: no respondas "Dale, estoy revisando" ni otra frase vacía. Responde solo cuando haya una pregunta, dato o acción comercial que atender.
- No narres procesos internos. Evita "déjame revisar", "estoy revisando", "voy a verificar" o "te confirmo" salvo que exista una operación real iniciada en ese mismo turno y debas esperar su resultado. Si falta un dato, pregunta ese dato; si ya están los datos, entrega la respuesta disponible.
- No repitas fecha, comuna, servicio y tipo de evento en cada turno. Usa esos datos internamente y menciona solo lo estrictamente útil para responder o avanzar.
- Varía naturalmente las aperturas: no comiences todos los mensajes con "Perfecto", "Buenísimo" o "Claro".
- Si el mensaje inicia una nueva intención de cotización (por ejemplo, "quiero cotizar" o "quiero ver opciones") sin decir "sobre lo mismo", "el mismo" o referirse explícitamente a algo anterior, trátalo como una oportunidad nueva: no reutilices automáticamente servicio, fecha, comuna, duración ni cotización histórica. Pide solo el dato mínimo que falta.
- La memoria histórica puede orientar, pero ACTIVE_CONTEXT contiene únicamente datos confirmados de la oportunidad actual. Recupera un dato histórico solo cuando el cliente lo referencia explícitamente (por ejemplo, "el tótem que vimos" o "sigamos con lo del 12").
- En el primer turno de una nueva cotización, si ACTIVE_CONTEXT no contiene un preferred_name confirmado, saluda y pregunta primero el nombre. No uses profile_name, nickname ni nombre histórico y no avances todavía a fecha, comuna o servicio. Después de que el cliente entregue su nombre, continúa con una sola pregunta comercial.
- Conserva exactamente el nombre confirmado por el cliente: "Matías" no se convierte en "Mati" salvo que el cliente pida explícitamente que lo llamen así.
- Entiende mensajes informales, abreviaturas y faltas de ortografía cuando la intención sea clara; no corrijas al cliente ni lo hagas repetir lo evidente.
- Usa como máximo un emoji ocasional cuando aporte calidez; no llenes la conversación de emojis.
- Si el nombre del cliente está disponible, úsalo de vez en cuando y nunca en cada respuesta.
- Preséntate como "${BIANCA_INTRODUCTION}" solo cuando corresponda.
- No digas ni insinúes que eres Matías, Founder o un trabajador humano.
- No menciones ORBIT, NOVA, IA, prompts, CRM, pipeline, estados internos ni automatizaciones.
- No obligues a usar menús.

PERSONALIDAD COMERCIAL:
- Sé breve, segura y orientada a ayudar a cotizar o reservar.
- BIANCA es la ejecutiva comercial digital oficial: atiende, entiende, orienta, recomienda y lleva al siguiente paso sin presión artificial.
- Refleja experiencia, entretención, confianza, agilidad y buena onda; premium sin sonar pretenciosa ni corporativa.
- Para una venta normal prefiere "¡Excelente!", "¡Buenísimo!", "Genial" o "Súper, te cuento". No uses "Qué lindo", "Qué hermoso" o "Qué maravilloso" como entusiasmo genérico.
- Si el cliente dice que está caro, valida la inquietud y ofrece revisar una alternativa más simple sin inventar descuentos.
- Si pide descuento, negociación especial, reclama, tiene un problema de pago/contrato o pide una persona, marca HUMAN_HANDOFF/HUMAN_REQUIRED y deriva al equipo.
- Si no tienes certeza, di: "Déjame revisar eso para darte la información correcta." Nunca rellenes el vacío con una suposición.
- Para una duda técnica que requiera revisión humana, di de forma natural: "No quiero darte una respuesta al lote. Déjame dejar esto con nuestro Director Comercial para que te confirme bien.".
- Adáptate a mensajes informales, abreviaturas, errores de ortografía y mensajes cortados sin corregir al cliente ni pedirle que repita lo evidente.
- Si el cliente pregunta por tu identidad ("y tú", "quién eres", "cómo te llamas"), responde quién eres como BIANCA y continúa la calificación comercial; eso no es una solicitud de humano.
- Solo ofrece seguimiento cuando exista una política autorizada y una intención comercial real; nunca envíes spam ni presión artificial.

LEADS DESDE FORMULARIO WEB:
- Cuando la fuente sea WEB_FORM_LEAD, trata el formulario como contexto estructurado de alta intención y reutiliza sus datos sin pedirlos de nuevo.
- El nombre explícito del formulario es un preferred_name confirmado para la oportunidad actual; saluda con ese nombre de forma natural, sin convertirlo en apodo.
- Si falta el año de una fecha parcial escrita en el mensaje libre (por ejemplo, 21.11), pide solo la confirmación del año; nunca inventes uno.
- Para matrimonios usa el catálogo canónico Novios/Matrimonios, para empresas el catálogo Empresas y para eventos generales el catálogo Eventos. Solicita CATALOG_LOOKUP; nunca inventes enlaces ni prometas un email si la acción no está realmente disponible.
- El lead web no termina al enviar un correo: continúa la conversación por WhatsApp con el siguiente paso comercial.

SERVICIOS BOOMBOX:
- Conoce estos servicios y explícalos solo cuando sea útil: Classic, Polaroid, Black Studio, BBOX360, LightBox, BoomBall, Instabox, Video Lounge, Hashtag y Photo IA.
- Photo IA es una oferta vigente, no legacy, aunque su ServiceId aún no esté normalizado. Puede ofrecer 2 horas o hasta 100 fotos IA por $500.000 y adicionales de 1 hora o 50 fotos por $190.000 cuando ese conocimiento contextual aplique; no inventes otras condiciones ni crees IDs internos.
- Usa también cualquier servicio futuro que esté activo en el catálogo canónico de ORBIT; nunca inventes uno.
- No entregues una ficha técnica completa sin que el cliente la pida. Para precio, duración, extras o disponibilidad usa siempre la consulta comercial canónica.

CONTROL COMERCIAL ABSOLUTO:
- Jamás inventes, calcules, estimes, extrapoles o sugieras precios, descuentos, traslados, impuestos, promociones, disponibilidad, vigencia ni condiciones comerciales.
- Jamás sumes planes o inventes una tarifa para una duración no configurada.
- No confirmes una fecha como disponible, una reserva, un pago, un catálogo enviado o una cotización enviada sin confirmación explícita del sistema.
- Si el cliente pregunta precio o disponibilidad, usa COMMERCIAL_LOOKUP. La autoridad comercial será ORBIT.
- Flujo estándar Matrimonios: el documento comercial corresponde al catálogo oficial Novios/Matrimonios activo; usa CATALOG_LOOKUP + WEDDINGS.
- Flujo estándar Cumpleaños, graduaciones y eventos normales: corresponde el catálogo oficial Eventos activo; usa CATALOG_LOOKUP + EVENTS.
- Flujo estándar Empresa sin requisitos especiales: corresponde el catálogo oficial Empresas activo; usa CATALOG_LOOKUP + COMPANIES.
- Empresa personalizada o cualquier solicitud especial NO debe resolverse combinando tarifas ni generando un catálogo diferente: usa MANUAL_REVIEW.
- Solicitud especial incluye varios días, jornada u horario fuera de estándar, combinación especial de servicios, BTL/activación, múltiples montajes o ubicaciones, branding/requerimiento técnico especial, cantidades fuera de catálogo, negociación/descuento o cualquier configuración no exacta.

FLUJO COMERCIAL:
- Descubre progresivamente tipo de evento, fecha, comuna, lugar, servicio, duración e invitados solo cuando aporten valor.
- La comuna se pregunta antes que el lugar libre: "¿En qué comuna es tu evento?" y luego "¿Cuál es el lugar o centro de eventos?".
- Cuando ya existan datos suficientes, solicita la consulta comercial real, entrega una recomendación breve y orienta al CTA de cotización/reserva.
- No confirmes una reserva solo porque el cliente la pide: requiere confirmación explícita del sistema.
- Si el cliente muestra intención real de reservar ("quiero reservar", "lo quiero", "cómo lo contrato"), deja de preguntar datos irrelevantes, confirma lo necesario y orienta al flujo correcto de cotización/reserva y abono.
- Si pregunta disponibilidad, consulta la fuente real; nunca respondas "seguramente" ni confirmes sin verificación.
- Si el cliente abandona una conversación, solo sugiere seguimiento cuando exista una política autorizada; nunca hagas spam.
- Nunca uses presión artificial ni amenazas de perder la fecha; menciona urgencia solo si la disponibilidad real lo justifica.

ESTADO COMERCIAL INTERNO:
- Clasifica cada turno en exactamente uno de estos estados, sin mostrarlos al cliente: NEW_LEAD, QUALIFYING, QUOTING, QUOTE_SENT, RESERVATION_INTENT, RESERVATION_STARTED, FOLLOW_UP, HUMAN_REQUIRED, CLOSED_WON o CLOSED_LOST.
- Usa HUMAN_REQUIRED para negociación especial, reclamo, problema, duda incierta, condición corporativa compleja o solicitud explícita de una persona.

CAPTURA DE DATOS:
- Extrae solo lo dicho o inferible con seguridad.
- Para la ubicación, pregunta primero: “¿En qué comuna es tu evento?” y después: “¿Cuál es el lugar o centro de eventos?”. La comuna es el dato estructurado para logística; el lugar es texto libre y puede no existir en ningún catálogo.
- Nunca presentes recintos especiales como únicas opciones ni agregues cargos por interpretar el texto libre. Si el sistema reconoce una variante especial de comuna, ORBIT resolverá el recargo desde esa selección estructurada.
- CONFIRMED = el cliente lo afirmó claramente.
- APPROXIMATE = rango, aproximación o dato tentativo.
- INFERRED = inferencia contextual segura, nunca contractual.
- Marca correction=true cuando el cliente está corrigiendo un valor anterior.
- No conviertas emociones o comentarios casuales en datos contractuales.

PRIORIDAD DE RESPUESTA:
1. Reclamo/problema importante.
2. Pregunta directa.
3. Corrección.
4. Datos nuevos.
5. Acción comercial solicitada.
6. Solo entonces, la siguiente pregunta necesaria.

OBJETIVO: que el cliente piense “me atendieron rápido y entendieron exactamente lo que necesitaba”.
`;

const MONEY_OR_AVAILABILITY_CLAIM = /(?:\$\s?\d|\b(?:CLP|USD|UF)\b|\b\d[\d.]*\s?(?:pesos|d[oó]lares)\b|\b(?:tenemos|hay|queda|est[aá])\s+disponibilidad\b|\bfecha\s+(?:est[aá]\s+)?disponible\b|\bdescuento\s+(?:de\s+)?\d)/i;
const FORCED_MANUAL_REVIEW = /\b(?:dos|2|tres|3|varios|m[uú]ltiples?)\s+d[ií]as\b|\bBTL\b|\bactivaci[oó]n\b|\b(?:dos|2|varios|m[uú]ltiples?)\s+(?:lugares|ubicaciones|montajes)\b|\bdescuento\b|\bnegoci(?:ar|aci[oó]n)\b|\bbranding\s+especial\b/i;
const PRICE_OBJECTION = /\b(?:est[aá]|esta)\s+(?:muy\s+)?car[oa]\b|\bme\s+parece\s+(?:muy\s+)?car[oa]\b|\bes\s+mucho\b/i;
const IDENTITY_QUESTION = /\b(?:y\s+t[uú]|qui[eé]n\s+(?:eres|me\s+responde)|c[oó]mo\s+te\s+llamas|cu[aá]l\s+es\s+tu\s+nombre|eres\s+bianca|tu\s+nombre)\b/i;
const SELF_INTRODUCTION = /^\s*(?:soy|me\s+llamo)\s+([A-Za-zÁÉÍÓÚáéíóúÑñ][A-Za-zÁÉÍÓÚáéíóúÑñ'-]{1,39})(?:\s+y\s+t[uú].*)?\s*$/i;
const EMPTY_ACKNOWLEDGEMENT = /^\s*(?:s[ií]|ok(?:ay)?|dale|perfecto|ya|listo|bueno|buen[ií]simo)[.!\s]*$/i;

function isIdentityQuestion(text: string) {
  return IDENTITY_QUESTION.test(text.trim());
}

function extractSelfIntroducedName(text: string) {
  const match = text.match(SELF_INTRODUCTION);
  return match?.[1]?.trim() || undefined;
}

export function isEmptyBiancaAcknowledgement(text: string) {
  return EMPTY_ACKNOWLEDGEMENT.test(text.trim());
}

function identityResponse(name?: string) {
  const greeting = name ? `¡Mucho gusto, ${name}!` : "¡Claro!";
  const variants = [
    `${greeting} 😊 Soy BIANCA, ejecutiva comercial de BOOMBOX. ¿Qué fecha tienes para tu matrimonio?`,
    `${greeting} 😊 Soy BIANCA de BOOMBOX y te voy a ayudar con la cotización. ¿Para qué fecha es tu matrimonio?`,
    `${greeting} Soy BIANCA, ejecutiva comercial de BOOMBOX. Cuéntame, ¿qué fecha tienes para el matrimonio?`,
  ];
  return variants[(name?.length ?? 0) % variants.length];
}

function safeCommercialFallback(input: NovaChannelInput, decision: WhatsAppAiDecision) {
  if (decision.intents.includes("OBJECION_PRECIO"))
    return "Te entiendo. Si quieres, puedo revisar una alternativa más simple para mantener la experiencia BOOMBOX y ajustar mejor el presupuesto.";
  if (decision.intents.includes("DISPONIBILIDAD"))
    return "Sí, lo reviso. ¿Me confirmas la fecha del evento?";
  if (decision.intents.includes("CONSULTA_PRECIO") || decision.intents.includes("QUIERE_COTIZAR"))
    return "Sí, te ayudo. Cuéntame la fecha, comuna y el servicio que te interesa para revisar lo que corresponde.";
  return "Perfecto, ya tomé los datos que me enviaste. Te ayudo con el siguiente paso.";
}

function actionFromDecision(decision: WhatsAppAiDecision): NovaNextAction {
  if (decision.requestedAction === "HUMAN_HANDOFF") return "WAIT_FOR_HUMAN";
  return "NONE";
}

function withOfficialSalesHandoff(response: string) {
  return `${response.trim()}\n\n${officialSalesHandoffCopy()}`;
}

export function firstContactNameResponse(messageText: string) {
  const variants = [
    "¡Hola! 😊 ¿Cómo estás? Antes de mandarte la info, ¿cómo te llamas?",
    "¡Hola! Qué bueno que nos escribas 😊 ¿Con quién tengo el gusto?",
    "¡Hola! 😊 Feliz de ayudarte. Para partir, ¿cómo te llamas?",
  ];
  return variants[messageText.trim().length % variants.length];
}

function statusFromDecision(decision: WhatsAppAiDecision): NovaChannelOutput["conversationStatus"] {
  if (decision.requestedAction === "HUMAN_HANDOFF") return "HUMAN_HANDOFF";
  if (decision.waitForMoreData || decision.requestedAction === "WAIT_FOR_CUSTOMER") return "WAITING_CUSTOMER";
  return "ACTIVE";
}

function safeAiFailure(input: NovaChannelInput): NovaChannelOutput {
  const response = "Perfecto, recibí tu mensaje. Lo vamos a revisar bien y te respondemos por acá.";
  return {
    response,
    nextRecommendedAction: "WAIT_FOR_HUMAN",
    conversationStatus: "HUMAN_HANDOFF",
    timelineEvent: {
      id: `${input.message.id}-ai-failure-handoff`,
      conversationId: input.message.conversationId,
      customerId: input.message.customerId,
      type: "HUMAN_HANDOFF_REQUESTED",
      occurredAt: input.message.receivedAt,
      description: "Atención derivada a BOOMBOX porque el asistente conversacional no pudo completar una respuesta segura.",
    },
  };
}

export class WhatsAppAiResponder implements NovaResponder {
  private lastDecisionValue: WhatsAppAiDecision | null = null;

  constructor(
    private readonly fallback: NovaChannelEngine,
    private readonly history: readonly WhatsAppConversationHistoryItem[],
    private readonly runtimeClient?: SupabaseClient,
  ) {}

  get lastDecision() {
    return this.lastDecisionValue;
  }

  async respond(input: NovaChannelInput): Promise<NovaChannelOutput> {
    if (isFounderRequest(input.message.text)) {
      this.lastDecisionValue = {
        responseText: founderRequestResponse(),
        commercialStage: "HUMAN_REQUIRED",
        intents: ["HABLAR_CON_PERSONA"],
        waitForMoreData: false,
        requestedAction: "HUMAN_HANDOFF",
        catalogCategory: "NONE",
        fields: [],
        conversationSummary: "Cliente solicita continuar con Matías o una persona de BOOMBOX.",
      };
      return {
        response: withOfficialSalesHandoff(founderRequestResponse()),
        nextRecommendedAction: "WAIT_FOR_HUMAN",
        conversationStatus: "HUMAN_HANDOFF",
        timelineEvent: {
          id: `${input.message.id}-founder-request-handoff`,
          conversationId: input.message.conversationId,
          customerId: input.message.customerId,
          type: "HUMAN_HANDOFF_REQUESTED",
          occurredAt: input.message.receivedAt,
          description: "Solicitud explícita de atención de Matías/persona derivada a Founder.",
        },
      };
    }
    const fastDecision = biancaFastPath(input);
    if (fastDecision) {
      this.lastDecisionValue = fastDecision;
      const handoff = fastDecision.requestedAction === "HUMAN_HANDOFF";
      return {
        response: handoff ? withOfficialSalesHandoff(fastDecision.responseText) : fastDecision.responseText,
        nextRecommendedAction: handoff ? "WAIT_FOR_HUMAN" : "NONE",
        conversationStatus: handoff ? "HUMAN_HANDOFF" : fastDecision.waitForMoreData ? "WAITING_CUSTOMER" : "ACTIVE",
        timelineEvent: {
          id: `${input.message.id}-fast-path-response`,
          conversationId: input.message.conversationId,
          customerId: input.message.customerId,
          type: handoff ? "HUMAN_HANDOFF_REQUESTED" : "INFORMATION_REQUESTED",
          occurredAt: input.message.receivedAt,
          description: handoff ? "Solicitud humana procesada por el fast path." : "Turno procesado por el fast path determinístico.",
        },
      };
    }
    try {
      const { model } = resolveOpenAiDirectModel();
      const history = this.history
        .slice(-30)
        .map((item) => `${item.direction === "INBOUND" ? "CLIENTE" : item.direction === "OUTBOUND" ? "BOOMBOX" : "SISTEMA"} [${item.occurredAt}]: ${item.body}`)
        .join("\n");
      const knownMemory = JSON.stringify(input.memory);
      const leadContext = input.source === "WEB_FORM_LEAD" ? normalizeBiancaWebLeadContext(input.leadContext) : undefined;
      const leadPrompt = input.source === "WEB_FORM_LEAD" ? buildBiancaWebLeadPrompt(leadContext) : "FUENTE DEL TURNO: DIRECT_WHATSAPP.";
      const playbook = selectBiancaSalesPlaybook({
        messageText: input.message.text,
        source: input.source,
        hasConfirmedName: Boolean(input.memory.customerName?.trim() || leadContext?.name),
        hasHistory: this.history.length > 0,
      });
      const priceLookup = this.runtimeClient && /(?:cu[aá]nto|precio|valor|cotiz|sale|cuesta)/i.test(input.message.text)
        ? await lookupBiancaPrice(this.runtimeClient, { text: input.message.text, serviceCodes: inferServiceCodes(input.message.text, input.memory.selectedServices ?? (input.memory.selectedService ? [input.memory.selectedService] : [])), durationHours: input.memory.recommendedHours, commune: input.leadContext?.commune, specialVenue: input.leadContext?.specialVenue })
        : null;
      const availabilityLookup = this.runtimeClient && /(?:disponib|fecha)/i.test(input.message.text)
        ? await lookupBiancaAvailability(this.runtimeClient, { eventDate: input.leadContext?.eventDate ?? input.memory.eventDate, durationHours: input.memory.recommendedHours, serviceCodes: inferServiceCodes(input.message.text, input.memory.selectedServices ?? (input.memory.selectedService ? [input.memory.selectedService] : [])), commune: input.leadContext?.commune, venue: input.leadContext?.venue })
        : null;
      const runtimeToolResult = JSON.stringify({ PRICE_LOOKUP: priceLookup, AVAILABILITY_LOOKUP: availabilityLookup });
      const commercialKnowledge = selectBiancaCommercialKnowledge({
        messageText: input.message.text,
        historyText: history,
      });
      const { object } = await generateObject({
        model,
        schema: aiDecisionSchema,
        system: MASTER_INSTRUCTIONS,
        prompt: `HISTORIAL RECIENTE:\n${history || "(sin historial previo)"}\n\nDATOS ESTRUCTURADOS YA CONOCIDOS:\n${knownMemory}\n\n${leadPrompt}\n\nPLAYBOOK DEL TURNO:\n${playbook}\n\n${responseStylePrompt()}\n\nRESULTADOS DE TOOLS ORBIT (fuente de verdad; no inventes ni recalcules):\n${runtimeToolResult}\nSi un resultado es ERROR, QUOTE_REQUIRED, MISSING_DURATION o INSUFFICIENT_DATA, no afirmes precio/disponibilidad: pide solo el dato faltante o deriva según corresponda.\n\n${commercialKnowledge}\n\nMENSAJE ACTUAL DEL CLIENTE:\n${input.message.text}\n\nDevuelve la mejor respuesta y la extracción estructurada. No inventes información comercial.`,
      });
      const priceObjection = PRICE_OBJECTION.test(input.message.text);
      const decision: WhatsAppAiDecision = FORCED_MANUAL_REVIEW.test(input.message.text)
        ? { ...object, requestedAction: "MANUAL_REVIEW", catalogCategory: "NONE", intents: [...new Set([...object.intents, "COTIZACION_ESPECIAL" as const])] }
        : priceObjection
          ? { ...object, intents: [...new Set([...object.intents, "OBJECION_PRECIO" as const])] }
          : object;
      const selfIntroducedName = extractSelfIntroducedName(input.message.text);
      const identityTurn = isIdentityQuestion(input.message.text) && !isFounderRequest(input.message.text);
      const directCatalogRequest = /\b(?:cat[aá]logo|planes|folleto|opciones)\b/i.test(input.message.text);
      const genericServicesRequest = ( /\b(?:qu[eé]|que)\s+(?:servicios?|opciones?)\s+(?:tienen|ofrecen|hay|manejan)\b/i.test(input.message.text)
        || /\bservicios?\s+(?:tienen|ofrecen|hay|manejan)\b/i.test(input.message.text) )
        && !/\b(?:precio|valor|cu[aá]nto|cotiz|reserv|descuento)\b/i.test(input.message.text);
      const planner = planBiancaTurn({
        text: input.message.text,
        known: {
          preferredName: input.memory.customerName ?? leadContext?.name,
          eventType: input.memory.eventType ?? leadContext?.eventType,
          eventDate: input.memory.eventDate ?? leadContext?.eventDate,
          commune: leadContext?.commune,
          venue: leadContext?.venue,
          serviceCodes: input.memory.selectedServices ?? (input.memory.selectedService ? [input.memory.selectedService] : []),
          durationHours: input.memory.recommendedHours,
          priceResolved: priceLookup?.status === "RESOLVED",
          availability: availabilityLookup?.status === "AVAILABLE" || availabilityLookup?.status === "UNAVAILABLE" ? availabilityLookup.status : undefined,
        },
      });
      if (selfIntroducedName) {
        decision.fields = [
          ...decision.fields.filter((field) => field.field !== "name"),
          { field: "name", value: selfIntroducedName, confidence: "CONFIRMED", correction: false },
        ];
      }
      if (leadContext) {
        const leadFieldMap = [
          ["name", leadContext.name],
          ["email", leadContext.email],
          ["eventType", leadContext.eventType],
          ["eventDate", leadContext.eventDate],
          ["commune", leadContext.commune],
          ["venue", leadContext.venue],
        ] as const;
        for (const [field, value] of leadFieldMap) {
          if (!value || decision.fields.some((item) => item.field === field)) continue;
          decision.fields.push({ field, value, confidence: "CONFIRMED", correction: false });
        }
      }
      if (identityTurn) {
        decision.responseText = identityResponse(selfIntroducedName);
        decision.waitForMoreData = true;
        decision.requestedAction = "WAIT_FOR_CUSTOMER";
        decision.commercialStage = "QUALIFYING";
        decision.intents = [...new Set([...decision.intents.filter((intent) => intent !== "HABLAR_CON_PERSONA"), "CONSULTA_GENERAL" as const])];
      }
      const confirmedName = decision.fields.some((field) => field.field === "name" && field.confidence === "CONFIRMED" && typeof field.value === "string" && field.value.trim());
      const preferredNameConfirmed = typeof input.memory.customerName === "string" && input.memory.customerName.trim().length > 0;
      const webLeadNameConfirmed = input.source === "WEB_FORM_LEAD" && Boolean(leadContext?.name);
      const firstContactNeedsName = input.source !== "WEB_FORM_LEAD" && isNewBiancaCommercialOpportunity(input.message.text) && !directCatalogRequest && !preferredNameConfirmed && !confirmedName && !webLeadNameConfirmed;
      if (firstContactNeedsName) {
        decision.responseText = firstContactNameResponse(input.message.text);
        decision.waitForMoreData = true;
        decision.requestedAction = "WAIT_FOR_CUSTOMER";
        decision.commercialStage = "NEW_LEAD";
      }
      if (isEmptyBiancaAcknowledgement(input.message.text) && !identityTurn && !selfIntroducedName) {
        decision.responseText = "";
        decision.waitForMoreData = true;
        decision.requestedAction = "WAIT_FOR_CUSTOMER";
        decision.commercialStage = "QUALIFYING";
      }
      // Deterministic controls outrank a non-committal LLM action proposal.
      // The model still writes the language, but the planner owns the action.
      if (planner.nextBestAction === "HANDOFF") {
        decision.requestedAction = "HUMAN_HANDOFF";
        decision.commercialStage = "HUMAN_REQUIRED";
      } else if (genericServicesRequest && decision.requestedAction !== "HUMAN_HANDOFF") {
        decision.requestedAction = "NONE";
        decision.catalogCategory = "NONE";
        decision.intents = [...new Set([...decision.intents.filter((intent) => intent !== "QUIERE_COTIZAR"), "CONSULTA_GENERAL" as const])];
        decision.responseText = "¡Hola! 😊 Tenemos cabinas de fotos, Black Studio, 360, Photo IA, LightBox, BoomBall y otras experiencias. ¿Es para un matrimonio, evento de empresa, cumpleaños u otro tipo de evento? Así te recomiendo lo que mejor calza.";
        decision.waitForMoreData = true;
        decision.commercialStage = "QUALIFYING";
      } else if (directCatalogRequest && decision.requestedAction !== "HUMAN_HANDOFF") {
        decision.requestedAction = "CATALOG_LOOKUP";
        // The current turn owns catalog specificity. Historical wedding or
        // corporate context may inform a recommendation, but must not hijack
        // a generic services/catalog question.
        const currentTurnText = input.message.text.toLowerCase();
        decision.catalogCategory = /matrimonio|novio|boda/.test(currentTurnText)
          ? "WEDDINGS"
          : /empresa|corporativ/.test(currentTurnText)
            ? "COMPANIES"
            : "EVENTS";
      }
      this.lastDecisionValue = decision;
      const response = MONEY_OR_AVAILABILITY_CLAIM.test(decision.responseText)
        ? safeCommercialFallback(input, decision)
        : decision.responseText.trim();
      const customerResponse = decision.requestedAction === "HUMAN_HANDOFF" || decision.requestedAction === "MANUAL_REVIEW"
        ? withOfficialSalesHandoff(response)
        : response;
      return {
        response: customerResponse,
        nextRecommendedAction: actionFromDecision(decision),
        conversationStatus: statusFromDecision(decision),
        timelineEvent: {
          id: `${input.message.id}-ai-response`,
          conversationId: input.message.conversationId,
          customerId: input.message.customerId,
          type: decision.requestedAction === "HUMAN_HANDOFF" ? "HUMAN_HANDOFF_REQUESTED" : "INFORMATION_REQUESTED",
          occurredAt: input.message.receivedAt,
          description: response,
        },
      };
    } catch (error) {
      console.error("whatsapp.ai.safe_handoff", {
        customerId: input.message.customerId,
        detail: error instanceof Error ? error.message : String(error),
      });
      this.lastDecisionValue = null;
      return safeAiFailure(input);
    }
  }
}
