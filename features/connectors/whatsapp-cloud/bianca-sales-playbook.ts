import type { BiancaMessageSource } from "@/features/nova-channel";

export const BIANCA_PLAYBOOK_CATEGORIES = [
  "GREETING", "NAME_DISCOVERY", "EVENT_DISCOVERY", "DATE_DISCOVERY", "COMMUNE_DISCOVERY",
  "SERVICE_DISCOVERY", "PRICE_REQUEST", "AVAILABILITY", "RECOMMENDATION", "OBJECTION_PRICE",
  "DISCOUNT", "MULTI_SERVICE", "RESERVATION", "FOLLOW_UP", "IDENTITY_QUESTION", "HUMAN_REQUEST",
  "COMPLAINT", "TECHNICAL", "WEB_LEAD", "RETURNING_CUSTOMER",
] as const;

export type BiancaSalesPlaybookCategory = (typeof BIANCA_PLAYBOOK_CATEGORIES)[number];

const RULES: Record<BiancaSalesPlaybookCategory, string> = {
  GREETING: "Saluda cálidamente y avanza con una sola pregunta útil.",
  NAME_DISCOVERY: "Si no hay nombre confirmado, pregunta con naturalidad antes de usar un nombre.",
  EVENT_DISCOVERY: "Descubre el tipo de evento sin convertir la conversación en formulario.",
  DATE_DISCOVERY: "Pide la fecha; si solo hay día/mes, confirma únicamente el año.",
  COMMUNE_DISCOVERY: "Pregunta primero comuna estructurada y luego lugar libre; nunca mezcles ambos.",
  SERVICE_DISCOVERY: "Entiende la experiencia buscada antes de recomendar; un tótem es una experiencia, no varios equipos.",
  PRICE_REQUEST: "Consulta precio canónico y responde sin narrar una revisión ni inventar cifras.",
  AVAILABILITY: "Consulta el gate real; AVAILABLE avanza, UNAVAILABLE ofrece alternativas y UNKNOWN escala.",
  RECOMMENDATION: "Recomienda según necesidad (elegante, clásico, social, video, impresión o IA), no siempre lo más caro.",
  OBJECTION_PRICE: "Empatiza y ofrece una alternativa real; no inventes descuentos.",
  DISCOUNT: "Solo promociones autorizadas; una excepción requiere HUMAN_REQUIRED.",
  MULTI_SERVICE: "Trata cada servicio real como servicio separado, validando capacidad y precio por servicio.",
  RESERVATION: "Con intención de reservar, deja de preguntar lo irrelevante y orienta al flujo real.",
  FOLLOW_UP: "Solo sigue una política autorizada y evita spam o presión artificial.",
  IDENTITY_QUESTION: "Responde que eres BIANCA y continúa la conversación; no es handoff.",
  HUMAN_REQUEST: "Escala únicamente ante una solicitud explícita o una excepción que requiera equipo.",
  COMPLAINT: "Prioriza empatía, solución segura y escalamiento cuando corresponda.",
  TECHNICAL: "No improvises; deriva dudas técnicas complejas al Director Comercial.",
  WEB_LEAD: "Reutiliza campos estructurados del formulario y pregunta solo lo que falte.",
  RETURNING_CUSTOMER: "Recupera histórico solo cuando el cliente lo referencia explícitamente.",
};

export function selectBiancaSalesPlaybook(input: { messageText: string; source?: BiancaMessageSource; hasConfirmedName?: boolean; hasHistory?: boolean }) {
  const text = input.messageText.toLowerCase();
  const categories: BiancaSalesPlaybookCategory[] = [];
  if (input.source === "WEB_FORM_LEAD") categories.push("WEB_LEAD");
  if (/cotiz|opciones|precio|cu[aá]nto/.test(text)) categories.push("PRICE_REQUEST");
  if (/disponib|fecha/.test(text)) categories.push("AVAILABILITY");
  if (/comuna|d[oó]nde|lugar|recinto/.test(text)) categories.push("COMMUNE_DISCOVERY");
  if (/reserv|contrat|lo quiero/.test(text)) categories.push("RESERVATION");
  if (/descuento|rebaja|negoci/.test(text)) categories.push("DISCOUNT");
  if (/caro|costoso/.test(text)) categories.push("OBJECTION_PRICE");
  if (/persona|ejecutivo|mat[ií]as|director comercial/.test(text)) categories.push("HUMAN_REQUEST");
  if (/qui[eé]n eres|c[oó]mo te llamas|y t[uú]/.test(text)) categories.push("IDENTITY_QUESTION");
  if (/sobre lo mismo|sigamos|el mismo|lo que vimos|cotizamos/.test(text) && input.hasHistory) categories.push("RETURNING_CUSTOMER");
  if (!input.hasConfirmedName && /cotiz|quiero|necesito/.test(text)) categories.push("NAME_DISCOVERY");
  if (!categories.length) categories.push("GREETING");
  return [...new Set(categories)].map((category) => `${category}: ${RULES[category]}`).join("\n");
}
