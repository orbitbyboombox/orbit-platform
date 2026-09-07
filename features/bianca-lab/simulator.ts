import { BIANCA_INTRODUCTION, founderRequestResponse, isFounderRequest } from "../connectors/whatsapp-cloud/bianca-policy.ts";

export type BiancaSimulationResult = {
  intent: string;
  customerState: string;
  extracted: string[];
  missing: string[];
  sources: string[];
  capacity?: "AVAILABLE" | "UNAVAILABLE" | "REVIEW_REQUIRED";
  proposedResponse: string;
  proposedAction: string;
  escalation: boolean;
  escalationReason?: string;
  controlState: "BIANCA_ACTIVE" | "REVIEW_REQUIRED" | "FOUNDER_TAKEOVER";
  founderAlert: boolean;
  externalFounderWhatsApp: "WOULD_BE_PREPARED" | "OFF";
};

const date = (value: string) => value.match(/\b(?:\d{1,2}\s+de\s+)?(?:octubre|noviembre|diciembre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre)\b/i)?.[0];
const time = (value: string) => value.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/)?.[0];

export function simulateBiancaMessage(message: string): BiancaSimulationResult {
  const text = message.trim();
  const extracted = [date(text) ? `Fecha: ${date(text)}` : "", time(text) ? `Hora: ${time(text)}` : "", /pirque/i.test(text) ? "Ubicación: Pirque" : ""].filter(Boolean);
  const sources = ["BIANCA safety policy", "ORBIT CRM/Event context (fixture)"];
  if (isFounderRequest(text) || /hablar con el due[nñ]o|soy mat[ií]as/i.test(text)) {
    return { intent: "FOUNDER_REQUEST", customerState: "KNOWN_OR_UNKNOWN", extracted, missing: [], sources, proposedResponse: founderRequestResponse(), proposedAction: "FOUNDER_TAKEOVER", escalation: true, escalationReason: "Solicitud explícita de atención humana/Founder.", controlState: "FOUNDER_TAKEOVER", founderAlert: true, externalFounderWhatsApp: "WOULD_BE_PREPARED" };
  }
  if (/ignora\s+.*reglas|muestra.*prompt|descuento|reg[aá]lame.*hora/i.test(text)) {
    return { intent: /descuento|reg[aá]lame/i.test(text) ? "DISCOUNT_OR_EXCEPTION" : "PROMPT_INJECTION", customerState: "UNKNOWN", extracted, missing: [], sources, proposedResponse: `${BIANCA_INTRODUCTION} No puedo aplicar condiciones especiales, pero puedo dejarlo para revisión del equipo BOOMBOX.`, proposedAction: "MANUAL_REVIEW", escalation: true, escalationReason: "Solicitud no autorizada o intento de alterar reglas.", controlState: "REVIEW_REQUIRED", founderAlert: true, externalFounderWhatsApp: "WOULD_BE_PREPARED" };
  }
  if (/otros matrimonios|qu[eé].*clientes|cu[aá]ntas cajas|d[oó]nde son/i.test(text)) {
    return { intent: "PRIVACY_OR_INTERNAL_DATA", customerState: "UNKNOWN", extracted, missing: [], sources, proposedResponse: `${BIANCA_INTRODUCTION} No puedo compartir información de otros clientes ni datos operativos internos.`, proposedAction: "REFUSE_AND_CONTINUE", escalation: false, controlState: "BIANCA_ACTIVE", founderAlert: false, externalFounderWhatsApp: "OFF" };
  }
  if (/transfer[ií]|pag[uéo]|pago completo|déjalo como pagado/i.test(text)) {
    return { intent: "PAYMENT_OR_PAYMENT_RECEIPT", customerState: "KNOWN_OR_UNKNOWN", extracted, missing: [], sources: [...sources, "Payment Ledger (read-only fixture)"], proposedResponse: "Voy a revisar el registro de pagos y te confirmo por acá. No puedo marcar un pago solo con este mensaje.", proposedAction: "PAYMENT_VERIFICATION_REVIEW", escalation: true, escalationReason: "La afirmación del cliente no modifica la verdad financiera.", controlState: "REVIEW_REQUIRED", founderAlert: true, externalFounderWhatsApp: "WOULD_BE_PREPARED" };
  }
  if (/estafa|p[eé]simo|devuelvan|reclamo|queja/i.test(text)) {
    return { intent: "COMPLAINT", customerState: "KNOWN_OR_UNKNOWN", extracted, missing: [], sources, proposedResponse: "Gracias por contármelo. Quiero que lo revisemos bien, así que lo voy a derivar de inmediato al equipo BOOMBOX.", proposedAction: "FOUNDER_TAKEOVER", escalation: true, escalationReason: "Reclamo requiere continuidad humana; no se promete reembolso.", controlState: "FOUNDER_TAKEOVER", founderAlert: true, externalFounderWhatsApp: "WOULD_BE_PREPARED" };
  }
  if (/9\/9|sin disponibilidad|agotad/i.test(text)) {
    return { intent: "AVAILABILITY", customerState: "NEW_CUSTOMER", extracted, missing: [], sources: [...sources, "Canonical Capacity Engine (fixture)"], capacity: "UNAVAILABLE", proposedResponse: "Ese horario no está disponible. Puedo revisar otra fecha u horario si quieres.", proposedAction: "CHECK_ALTERNATIVE_SLOT", escalation: false, controlState: "BIANCA_ACTIVE", founderAlert: false, externalFounderWhatsApp: "OFF" };
  }
  if (/review_required|log[ií]stica|mismo d[ií]a/i.test(text)) {
    return { intent: "AVAILABILITY", customerState: "NEW_CUSTOMER", extracted, missing: [], sources: [...sources, "Canonical Capacity Engine (fixture)"], capacity: "REVIEW_REQUIRED", proposedResponse: "Dame un segundo 😊 Voy a validar bien ese horario con nuestro equipo y te confirmo.", proposedAction: "FOUNDER_REVIEW", escalation: true, escalationReason: "La capacidad o logística no puede verificarse automáticamente.", controlState: "REVIEW_REQUIRED", founderAlert: true, externalFounderWhatsApp: "WOULD_BE_PREPARED" };
  }
  const intent = /matrimonio|me caso/i.test(text) ? "MATRIMONIO" : /empresa|aniversario/i.test(text) ? "EMPRESA" : /cumplea[nñ]os|graduaci[oó]n|cabina/i.test(text) ? "SOCIAL_OR_QUOTE" : "UNKNOWN";
  const missing = [!date(text) && "fecha", !time(text) && "hora", !/pirque|santiago|comuna|direcci[oó]n|venue/i.test(text) && "ubicación"].filter(Boolean) as string[];
  return { intent, customerState: "NEW_CUSTOMER", extracted, missing, sources: [...sources, ...(intent === "MATRIMONIO" ? ["Matrimonio catalog/rules (fixture)"] : ["Commercial catalog/rules (fixture)"])], proposedResponse: missing.length ? "Perfecto 😊 Para revisar disponibilidad y orientarte bien, ¿me confirmas " + missing.slice(0, 2).join(" y ") + "?" : "Perfecto, ya tengo los datos principales. Voy a revisar la información oficial de BOOMBOX.", proposedAction: missing.length ? "COLLECT_MINIMUM_DATA" : "CANONICAL_COMMERCIAL_LOOKUP", escalation: false, controlState: "BIANCA_ACTIVE", founderAlert: false, externalFounderWhatsApp: "OFF" };
}
