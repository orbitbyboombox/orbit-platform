import "server-only";
import { buildSocialPlansEmail } from "./social-plans-email";
import { catalogCategoryForQuickSend, catalogPublicUrl } from "./catalogs";
import { quickSendInitialBody } from "./presentation";
import { evaluateBoomboxWebLead, type WebLead } from "./web-lead-intake";

/** Dry-run uses exactly the premium social-quote renderer currently used by ORBIT. */
export function previewAutomaticWebQuoteEmail(input: WebLead) {
  const decision = evaluateBoomboxWebLead(input);
  if (!decision.eligible || !decision.normalizedEmail || decision.category === "REVIEW") {
    return { ok: false as const, reason: decision.reason ?? "MANUAL_REVIEW" };
  }
  const category = decision.category;
  const body = quickSendInitialBody(category, "");
  const catalogUrl = catalogPublicUrl(catalogCategoryForQuickSend(category));
  const rendered = buildSocialPlansEmail({
    category,
    body,
    contact: input.name!.trim(),
    website: "https://www.boom-box.cl",
    catalogUrl,
  });
  return {
    ok: true as const,
    deliveryMode: "DRY_RUN" as const,
    category,
    to: decision.normalizedEmail,
    from: "contacto@bbox.cl",
    subject: category === "WEDDINGS"
      ? "BOOMBOX | Planes y valores para tu matrimonio"
      : category === "BIRTHDAYS"
        ? "BOOMBOX | Planes y valores para tu cumpleaños"
        : "BOOMBOX | Planes y valores para tu graduación",
    catalogUrl,
    html: rendered.html,
    text: rendered.text,
    dedupeKey: decision.dedupeKey,
  };
}
