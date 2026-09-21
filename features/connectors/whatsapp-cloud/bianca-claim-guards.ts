const PRICE_CLAIM = /(?:\$\s?[\d.]+|\b(?:CLP|USD|UF)\b|\b\d[\d.]*\s?pesos\b)/i;
const AVAILABILITY_CLAIM = /\b(?:est[aá]|hay|tenemos|queda)\s+disponib(?:le|ilidad)\b|\bfecha\s+(?:est[aá]\s+)?disponible\b/i;
const CATALOG_CLAIM = /\b(?:te\s+)?(?:envi[eé]|mand[eé]|compart[ií])\s+(?:el\s+)?cat[aá]logo\b/i;
const EMAIL_CLAIM = /\b(?:te\s+)?(?:envi[eé]|mand[eé])\s+(?:el\s+)?correo\b/i;
const QUOTE_CLAIM = /\b(?:cotizaci[oó]n|propuesta)\s+(?:est[aá]\s+)?(?:lista|preparada|creada)\b/i;
const RESERVATION_CLAIM = /\b(?:reserva|proceso de reserva)\s+(?:est[aá]\s+)?(?:iniciad[oa]|cread[oa]|confirmad[oa])\b/i;
const PROMISE_CLAIM = /\b(?:te\s+)?(?:enviar[eé]|mandar[eé]|compartir[eé]|avisar[eé]|confirmar[eé])\b/i;

export interface BiancaActionEvidence {
  priceResolved?: boolean;
  availability?: "AVAILABLE" | "UNAVAILABLE";
  catalogSent?: boolean;
  emailSent?: boolean;
  quoteCreated?: boolean;
  reservationStarted?: boolean;
  jobId?: string;
}

export function unsupportedBiancaClaims(response: string, evidence: BiancaActionEvidence) {
  const violations: string[] = [];
  if (PRICE_CLAIM.test(response) && !evidence.priceResolved) violations.push("PRICE_LOOKUP_REQUIRED");
  if (AVAILABILITY_CLAIM.test(response) && evidence.availability !== "AVAILABLE") violations.push("AVAILABILITY_LOOKUP_REQUIRED");
  if (CATALOG_CLAIM.test(response) && !evidence.catalogSent) violations.push("SEND_CATALOG_REQUIRED");
  if (EMAIL_CLAIM.test(response) && !evidence.emailSent) violations.push("SEND_EMAIL_REQUIRED");
  if (QUOTE_CLAIM.test(response) && !evidence.quoteCreated) violations.push("QUOTE_CREATE_REQUIRED");
  if (RESERVATION_CLAIM.test(response) && !evidence.reservationStarted) violations.push("RESERVATION_START_REQUIRED");
  if (PROMISE_CLAIM.test(response) && !evidence.jobId && !evidence.catalogSent && !evidence.emailSent) violations.push("REAL_ACTION_OR_JOB_REQUIRED");
  return violations;
}

export function assertBiancaClaims(response: string, evidence: BiancaActionEvidence) {
  const violations = unsupportedBiancaClaims(response, evidence);
  if (violations.length) throw new Error(`BIANCA_UNSUPPORTED_CLAIM:${violations.join(",")}`);
}
