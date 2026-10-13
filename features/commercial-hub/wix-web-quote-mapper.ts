import type { WebLead } from "./web-lead-intake";

// The keys below were verified against Wix Forms submissions for BOOMBOX.
// This mapper never sends mail or modifies a submission.
export const BOOMBOX_WIX_QUOTE_FORM_ID = "62c91088-7767-4864-80d7-5ced540b95d9";

type WixSubmission = {
  id?: string;
  formId?: string;
  submissions?: Record<string, unknown>;
};

const asText = (v: unknown): string => typeof v === "string" ? v.trim() : "";

export function mapBoomboxWixQuoteSubmission(item: WixSubmission): WebLead | null {
  if (item.formId !== BOOMBOX_WIX_QUOTE_FORM_ID || !item.id || !item.submissions) return null;
  const fields = item.submissions;
  const eventDate = asText(fields.fecha);
  return {
    sourceUrl: "https://www.boom-box.cl/",
    submissionId: item.id,
    name: asText(fields.nombre_37c7),
    email: asText(fields.email_44be),
    phone: asText(fields.telefono_aa57),
    eventType: asText(fields.tipo_de_evento),
    eventDate,
  };
}
