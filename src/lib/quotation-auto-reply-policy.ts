/** Founder-approved quotation routing. Pure policy: never sends email. */
export type QuoteCategory = "wedding" | "birthday" | "graduation" | "corporate" | "special" | "unknown";
export type QuoteDecision = { category: QuoteCategory; mode: "automatic" | "manual"; reason: string };
const rules: ReadonlyArray<{ category: QuoteCategory; pattern: RegExp }> = [
  { category: "corporate", pattern: /\b(empresa|empresarial|corporativo|corporativa|activaci[oó]n de marca|feria|congreso|seminario)\b/i },
  { category: "special", pattern: /\b(evento especial|evento personalizado|producci[oó]n especial|varios d[ií]as|m[uú]ltiples d[ií]as)\b/i },
  { category: "wedding", pattern: /\b(matrimonio|boda|casamiento)\b/i },
  { category: "birthday", pattern: /\b(cumplea[nñ]os|cumple)\b/i },
  { category: "graduation", pattern: /\b(graduaci[oó]n|licenciatura|egreso)\b/i },
];
export function classifyQuotation(input: string): QuoteDecision {
  const text = input.normalize("NFC").trim();
  if (!text) return { category: "unknown", mode: "manual", reason: "empty" };
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const matches = rules.filter(rule => rule.pattern.test(normalized)).map(rule => rule.category);
  const unique = [...new Set(matches)];
  if (unique.length !== 1) return { category: "unknown", mode: "manual", reason: unique.length ? "ambiguous" : "unclassified" };
  const category = unique[0];
  if (category === "corporate" || category === "special") return { category, mode: "manual", reason: "founder-review-required" };
  return { category, mode: "automatic", reason: "founder-authorized-category" };
}
