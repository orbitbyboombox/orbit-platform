import type { NovaChannelInput } from "@/features/nova-channel";
import type { WhatsAppAiDecision } from "./whatsapp-ai.responder";
import { parseBiancaStructuredWebLead } from "./bianca-web-lead-context.ts";

const textOf = (text: string) => text.toLocaleLowerCase("es-CL").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const field = (fieldName: string, value: string | number) => ({ field: fieldName as never, value, confidence: "CONFIRMED" as const, correction: false });

export function biancaFastPath(input: NovaChannelInput): WhatsAppAiDecision | null {
  const text = textOf(input.message.text).trim();
  const lead = input.source === "WEB_FORM_LEAD" ? input.leadContext : parseBiancaStructuredWebLead(input.message.text, input.message.senderExternalId)?.context;
  if (lead) {
    const fields = [
      lead.name && field("name", lead.name), lead.email && field("email", lead.email), lead.eventType && field("eventType", lead.eventType),
      lead.eventDate && field("eventDate", lead.eventDate), lead.commune && field("commune", lead.commune), lead.venue && field("venue", lead.venue),
    ].filter(Boolean) as WhatsAppAiDecision["fields"];
    const missingYear = lead.eventDateYearPending === true;
    return {
      responseText: missingYear
        ? `Hola${lead.name ? ` ${lead.name}` : ""} 😊 Ya tengo los datos de tu ${lead.eventType?.toLowerCase() ?? "evento"} en ${lead.locationContext ?? lead.commune ?? "el lugar indicado"}. Para revisar disponibilidad necesito confirmar el año de la fecha ${lead.eventDateParts?.day}/${lead.eventDateParts?.month}.`
        : `Hola${lead.name ? ` ${lead.name}` : ""} 😊 Gracias por escribirnos. Ya tengo los datos de tu ${lead.eventType?.toLowerCase() ?? "evento"}${lead.locationContext ? ` en ${lead.locationContext}` : ""}. ¿Hay algún servicio de BOOMBOX que ya tengas en mente o prefieres que te recomiende las mejores opciones?`,
      commercialStage: "QUALIFYING", intents: ["QUIERE_COTIZAR", "ENTREGA_DATOS"], waitForMoreData: true,
      requestedAction: "WAIT_FOR_CUSTOMER", catalogCategory: "NONE", fields,
      conversationSummary: "Lead web estructurado procesado por fast path.",
    };
  }
  if (/^(?:hola|holi|buenas|buenos dias|buenas tardes|buenas noches)[!.\s]*$/i.test(text)) return {
    responseText: "¡Hola! 😊 Soy BIANCA de BOOMBOX. ¿Qué tipo de evento estás preparando?", commercialStage: "NEW_LEAD", intents: ["CONSULTA_GENERAL"], waitForMoreData: true, requestedAction: "WAIT_FOR_CUSTOMER", catalogCategory: "NONE", fields: [], conversationSummary: "Saludo procesado por fast path.",
  };
  if (/\b(?:quiero hablar con una persona|hablar con alguien|matias|matias|ejecutiv[oa])\b/i.test(text)) return {
    responseText: "Claro, te derivo con el equipo BOOMBOX.", commercialStage: "HUMAN_REQUIRED", intents: ["HABLAR_CON_PERSONA"], waitForMoreData: false, requestedAction: "HUMAN_HANDOFF", catalogCategory: "NONE", fields: [], conversationSummary: "Solicitud humana procesada por fast path.",
  };
  if (/\b(?:medios? de pago|como se paga|cómo se paga|cuando pago|cu[aá]ndo pago|abono|transferencia|tarjeta|webpay)\b/i.test(text)) return {
    responseText: "Te explico nuestras condiciones de pago según las reglas comerciales vigentes de BOOMBOX.", commercialStage: "QUALIFYING", intents: ["PAGO"], waitForMoreData: false, requestedAction: "COMMERCIAL_LOOKUP", catalogCategory: "NONE", fields: [], conversationSummary: "Consulta de pago procesada por fast path.",
  };
  if (/\b(?:me mandas?|m[aá]ndame|tienen)\s+(?:el\s+)?cat[aá]logo\b/i.test(text)) return {
    responseText: "Sí, te comparto el catálogo general de BOOMBOX.", commercialStage: "QUALIFYING", intents: ["CONSULTA_GENERAL"], waitForMoreData: false, requestedAction: "CATALOG_LOOKUP", catalogCategory: /matrimonio|novio|boda/i.test(text) ? "WEDDINGS" : /empresa|corporativ/i.test(text) ? "COMPANIES" : "EVENTS", fields: [], conversationSummary: "Solicitud de catálogo procesada por fast path.",
  };
  if (/\b(?:que servicios tienen|qué servicios tienen|que ofrecen|qué ofrecen)\b/i.test(text)) return {
    responseText: "¡Hola! 😊 Tenemos cabinas de fotos, Black Studio, 360, Photo IA, LightBox, BoomBall y otras experiencias. ¿Es para un matrimonio, evento de empresa, cumpleaños u otro tipo de evento? Así te recomiendo lo que mejor calza.", commercialStage: "QUALIFYING", intents: ["CONSULTA_GENERAL", "RECOMENDACION"], waitForMoreData: true, requestedAction: "WAIT_FOR_CUSTOMER", catalogCategory: "NONE", fields: [], conversationSummary: "Consulta general de servicios procesada por fast path.",
  };
  return null;
}
