export const BIANCA_RESPONSE_STYLE_BANK = {
  greeting: ["warm", "short", "professional"],
  price: ["direct", "confident", "no_process_narration"],
  objection: ["empathetic", "alternative_focused", "no_discount_invention"],
  reservation: ["decisive", "clear_cta", "minimal_questions"],
  handoff: ["calm", "clean_cta", "no_raw_url"],
} as const;

export function responseStylePrompt() {
  return [
    "BANCO DE ESTILO: varía semánticamente la apertura; no repitas el mismo opening en los últimos 3 mensajes.",
    "No uses el nombre del cliente en mensajes consecutivos ni emojis en todos los mensajes.",
    "Mantén 1–4 líneas de WhatsApp y una pregunta principal cuando sea posible.",
  ].join("\n");
}
