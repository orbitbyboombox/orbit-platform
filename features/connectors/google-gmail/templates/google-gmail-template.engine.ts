import { getEventType, getService } from "@/features/business-core";
import { DEFAULT_COMPANY_SETTINGS, type CompanySettings } from "@/features/company-settings";
import type { GmailCommunicationType, GmailRenderedTemplate, GmailTemplateContext } from "../types/google-gmail-live.types";

const TEMPLATE_COPY: Record<GmailCommunicationType, { subject: string; headline: string; message: string }> = {
  QUOTATION: { subject: "Tu cotización", headline: "Tu experiencia está lista para revisar", message: "Preparamos la cotización de tu evento con toda la información conversada." },
  CONTRACT: { subject: "Acuerdo de tu experiencia", headline: "Revisa tu acuerdo", message: "Tu acuerdo está disponible para revisar antes de continuar con la reserva." },
  RESERVATION_CONFIRMATION: { subject: "Tu reserva está confirmada", headline: "🎉 BIENVENIDOS A BOOMBOX", message: "La reserva ha sido confirmada correctamente. En los próximos minutos recibirás una copia del contrato firmado." },
  PAYMENT_CONFIRMATION: { subject: "Pago validado", headline: "Pago confirmado", message: "Recibimos y validamos correctamente tu pago." },
  REMINDER: { subject: "Recordatorio de tu experiencia", headline: "Tu evento se acerca", message: "Queremos ayudarte a completar el siguiente paso de tu experiencia." },
  FINAL_CONFIRMATION: { subject: "Todo listo para tu evento", headline: "Experiencia confirmada", message: "La información operacional de tu evento está confirmada." },
  INTERNAL_NOTIFICATION: { subject: "Actualización operacional ORBIT", headline: "Notificación para Staff", message: "Existe una actualización operacional que requiere revisión." },
};

function escapeHtml(value: string) { return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character); }

export class GoogleGmailTemplateEngine {
  constructor(private readonly company:CompanySettings=DEFAULT_COMPANY_SETTINGS){}
  render(type: GmailCommunicationType, context: GmailTemplateContext): GmailRenderedTemplate {
    const copy = TEMPLATE_COPY[type];
    const recipient = type === "INTERNAL_NOTIFICATION" ? context.staffName : context.customer.customerName;
    if (!recipient) throw new Error("La plantilla requiere un destinatario conocido.");
    const eventType = context.eventTypeId ? getEventType(context.eventTypeId).name : context.customer.knownInformation.eventType;
    const service = context.serviceId ? getService(context.serviceId).name : context.customer.knownInformation.selectedService;
    const countdown = context.timeIntelligence?.countdown.label;
    const operationalMessage = context.operationalMessage ?? copy.message;
    const details = [eventType, service, countdown].filter(Boolean).join(" · ");
    const commercialSummary = type === "RESERVATION_CONFIRMATION" ? context.commercialSummary ?? [] : [];
    const portal = context.portalUrl ? `🟠 Ingresar a Mi Evento: ${context.portalUrl}. Accede usando tu RUT y la fecha de tu evento. No necesitas cuenta ni contraseña.` : "";
    const subject=`${copy.subject} · ${this.company.brandName}`;
    const textBody = [`Hola ${recipient},`, operationalMessage, details, commercialSummary.length ? `Resumen comercial\n${commercialSummary.join("\n")}` : "", portal, this.company.emailSignature].filter(Boolean).join("\n\n");
    return {
      type,
      subject,
      textBody,
      htmlBody: `<main><img src="${this.company.emailLogoUrl}" alt="${escapeHtml(`${this.company.productName} ${this.company.productVersion}`)}" width="320" /><p>Hola ${escapeHtml(recipient)},</p><h1>${escapeHtml(copy.headline)}</h1><p>${escapeHtml(operationalMessage)}</p>${details ? `<p>${escapeHtml(details)}</p>` : ""}${commercialSummary.length ? `<section><h2>Resumen comercial</h2><ul>${commercialSummary.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></section>` : ""}${context.portalUrl ? `<p><a href="${escapeHtml(context.portalUrl)}" style="display:inline-block;background:#F78900;color:#111;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">🟠 Ingresar a Mi Evento</a></p>` : ""}<p>${escapeHtml(this.company.emailSignature)}</p></main>`,
    };
  }
}

export const GMAIL_TEMPLATE_TYPES = Object.keys(TEMPLATE_COPY) as readonly GmailCommunicationType[];
