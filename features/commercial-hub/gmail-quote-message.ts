import { createHash } from "node:crypto";
import type { WebLead } from "./web-lead-intake";
import { isBoomboxWixQuoteMail } from "./gmail-web-quote-filter";

export type GmailQuoteMessage = {
  id: string;
  subject: string;
  from: string;
  body: string;
};
const allowedLabels: Record<string, keyof Pick<WebLead,"name"|"email"|"phone"|"eventType"|"eventDate">> = {
  nombre: "name",
  correo: "email",
  email: "email",
  telefono: "phone",
  celular: "phone",
  "tipo de evento": "eventType",
  "tipo evento": "eventType",
  fecha: "eventDate",
};
const fold = (input: string) => input.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const isoDate = (value: string): string => {
  const clean = value.trim();
  const match = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(clean);
  return match ? `${match[3]}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}` : clean;
};
export function parseBoomboxQuoteGmailMessage(mail: GmailQuoteMessage, allowedSenders: readonly string[]): WebLead | null {
  if (!isBoomboxWixQuoteMail(mail, allowedSenders)) return null;
  const details: Partial<WebLead> = {};
  for (const line of mail.body.replace(/\r\n?/g,"\n").split("\n")) {
    const match = /^\s*([^:]{2,42})\s*:\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const key = allowedLabels[fold(match[1])];
    if (key) details[key] = match[2].trim();
  }
  // Use immutable provider message id for idempotency; never trust a claimed web source in email.
  return {
    sourceUrl: "https://www.boom-box.cl/",
    submissionId: createHash("sha256").update(`gmail:${mail.id}`).digest("hex"),
    name: details.name ?? "",
    email: details.email ?? "",
    phone: details.phone ?? "",
    eventType: details.eventType ?? "",
    eventDate: isoDate(details.eventDate ?? ""),
  };
}
