import { type BiancaIntent } from "./bianca-agent.types.ts";

const rules: Array<[BiancaIntent, RegExp]> = [
  ["HUMAN_REQUEST", /\b(?:persona|humano|mat[ií]as|director comercial|ejecutivo)\b/i],
  ["COMPLAINT", /\b(?:reclamo|problema|molestia|denuncia)\b/i],
  ["DISCOUNT_REQUEST", /\b(?:descuento|rebaja|negociar|negociaci[oó]n|m[aá]s\s+barato|bajar\s+el\s+precio)\b/i],
  ["PRICE_OBJECTION", /\b(?:caro|cara|mucho|presupuesto)\b/i],
  ["ASK_RESERVATION", /\b(?:reservar|reserva|contratar|lo quiero|me quedo)\b/i],
  ["ASK_AVAILABILITY", /\b(?:disponib(?:le|ilidad)?|hay fecha|queda fecha)\b/i],
  ["ASK_CATALOG", /\b(?:cat[aá]logo|planes|folleto|opciones)\b/i],
  ["ASK_PRICE", /\b(?:precio|valor|cu[aá]nto|cuesta|sale|cot[ií]z\w*)\b/i],
  ["REQUEST_EMAIL", /\b(?:correo|email|e-mail|mail)\b/i],
  ["ASK_COMMUNE", /\b(?:comuna|municipio)\b/i],
  ["ASK_SERVICE", /\b(?:servicio|experiencia|t[oó]tem|fotograf[ií]a)\b/i],
  ["GREETING", /^(?:hola|holi|buenas|buenos d[ií]as|buenas tardes|buenas noches)\b/i],
];

export function detectBiancaIntents(text: string): BiancaIntent[] {
  const found = rules.filter(([, pattern]) => pattern.test(text)).map(([intent]) => intent);
  return found.length ? found : ["UNKNOWN"];
}

export function primaryBiancaIntent(text: string): BiancaIntent {
  return detectBiancaIntents(text)[0] ?? "UNKNOWN";
}
