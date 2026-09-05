import { generateObject } from "ai";
import { z } from "zod";
import type { NovaChannelInput, NovaChannelOutput, NovaNextAction } from "@/features/nova-channel";
import type { NovaResponder } from "@/features/nova-channel/engine/nova-responder";
import { NovaChannelEngine } from "@/features/nova-channel";

const INTENTS = [
  "CONSULTA_GENERAL",
  "CONSULTA_PRECIO",
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

export type WhatsAppAiDecision = z.infer<typeof aiDecisionSchema>;

export interface WhatsAppConversationHistoryItem {
  direction: "INBOUND" | "OUTBOUND" | "SYSTEM";
  body: string;
  occurredAt: string;
}

const MASTER_INSTRUCTIONS = `
Eres parte del equipo comercial de BOOMBOX Chile y atiendes WhatsApp como una persona real del equipo.
Tu trabajo es comprender, responder y estructurar información. NO eres una calculadora de precios ni una fuente de verdad comercial.

REGLAS DE CONVERSACIÓN:
- Lee toda la conversación antes de responder.
- Responde primero la pregunta directa del cliente y después pregunta solo lo mínimo que falte.
- Nunca vuelvas a pedir un dato que ya aparece en la conversación.
- Si el cliente envía varios datos juntos, aprovéchalos todos.
- Si corrige un dato, la corrección más reciente prevalece.
- Si dice que mandará más datos, que confirmará algo o que necesita un momento, no lo interrogues: espera de forma natural.
- Mensajes cortos, humanos, cálidos y profesionales; normalmente 1 a 3 frases.
- Español natural de Chile, sin exagerar modismos ni parecer robot.
- No menciones ORBIT, NOVA, IA, prompts, CRM, pipeline, estados internos ni automatizaciones.
- No obligues a usar menús.

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

CAPTURA DE DATOS:
- Extrae solo lo dicho o inferible con seguridad.
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

function safeCommercialFallback(input: NovaChannelInput, decision: WhatsAppAiDecision) {
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

function statusFromDecision(decision: WhatsAppAiDecision): NovaChannelOutput["conversationStatus"] {
  if (decision.requestedAction === "HUMAN_HANDOFF") return "HUMAN_HANDOFF";
  if (decision.waitForMoreData || decision.requestedAction === "WAIT_FOR_CUSTOMER") return "WAITING_CUSTOMER";
  return "ACTIVE";
}

export class WhatsAppAiResponder implements NovaResponder {
  private lastDecisionValue: WhatsAppAiDecision | null = null;

  constructor(
    private readonly fallback: NovaChannelEngine,
    private readonly history: readonly WhatsAppConversationHistoryItem[],
  ) {}

  get lastDecision() {
    return this.lastDecisionValue;
  }

  async respond(input: NovaChannelInput): Promise<NovaChannelOutput> {
    try {
      const model = process.env.ORBIT_WHATSAPP_AI_MODEL?.trim() || "openai/gpt-5.6-sol";
      const history = this.history
        .slice(-30)
        .map((item) => `${item.direction === "INBOUND" ? "CLIENTE" : item.direction === "OUTBOUND" ? "BOOMBOX" : "SISTEMA"} [${item.occurredAt}]: ${item.body}`)
        .join("\n");
      const knownMemory = JSON.stringify(input.memory);
      const { object } = await generateObject({
        model,
        schema: aiDecisionSchema,
        system: MASTER_INSTRUCTIONS,
        prompt: `HISTORIAL RECIENTE:\n${history || "(sin historial previo)"}\n\nDATOS ESTRUCTURADOS YA CONOCIDOS:\n${knownMemory}\n\nMENSAJE ACTUAL DEL CLIENTE:\n${input.message.text}\n\nDevuelve la mejor respuesta y la extracción estructurada. No inventes información comercial.`,
        providerOptions: {
          gateway: {
            user: input.message.customerId,
            tags: ["feature:boombox-whatsapp", "channel:whatsapp"],
          },
        },
      });
      const decision: WhatsAppAiDecision = FORCED_MANUAL_REVIEW.test(input.message.text)
        ? { ...object, requestedAction: "MANUAL_REVIEW", catalogCategory: "NONE", intents: [...new Set([...object.intents, "COTIZACION_ESPECIAL" as const])] }
        : object;
      this.lastDecisionValue = decision;
      const response = MONEY_OR_AVAILABILITY_CLAIM.test(decision.responseText)
        ? safeCommercialFallback(input, decision)
        : decision.responseText.trim();
      return {
        response,
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
      console.error("whatsapp.ai.fallback", {
        customerId: input.message.customerId,
        detail: error instanceof Error ? error.message : String(error),
      });
      this.lastDecisionValue = null;
      return this.fallback.respond(input);
    }
  }
}
