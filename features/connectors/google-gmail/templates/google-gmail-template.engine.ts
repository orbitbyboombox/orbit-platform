import { getEventType, getService } from "@/features/business-core";
import { OFFICIAL_ORBIT_LOGO_PATH } from "@/lib/branding";
import type { GmailCommunicationType, GmailRenderedTemplate, GmailTemplateContext } from "../types/google-gmail-live.types";

const TEMPLATE_COPY: Record<GmailCommunicationType, { subject: string; headline: string; message: string }> = {
  QUOTATION: { subject: "Tu cotización BOOMBOX", headline: "Tu experiencia está lista para revisar", message: "Preparamos la cotización de tu evento con toda la información conversada." },
  CONTRACT: { subject: "Acuerdo de tu experiencia BOOMBOX", headline: "Revisa tu acuerdo", message: "Tu acuerdo está disponible para revisar antes de continuar con la reserva." },
  RESERVATION_CONFIRMATION: { subject: "Tu fecha está reservada", headline: "Reserva confirmada", message: "BOOMBOX confirmó oficialmente la reserva de tu evento." },
  PAYMENT_CONFIRMATION: { subject: "Pago validado por BOOMBOX", headline: "Pago confirmado", message: "Recibimos y validamos correctamente tu pago." },
  REMINDER: { subject: "Recordatorio de tu experiencia BOOMBOX", headline: "Tu evento se acerca", message: "Queremos ayudarte a completar el siguiente paso de tu experiencia." },
  FINAL_CONFIRMATION: { subject: "Todo listo para tu evento", headline: "Experiencia confirmada", message: "La información operacional de tu evento está confirmada." },
  INTERNAL_NOTIFICATION: { subject: "Actualización operacional ORBIT", headline: "Notificación para Staff", message: "Existe una actualización operacional que requiere revisión." },
};

function escapeHtml(value: string) { return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character); }

export class GoogleGmailTemplateEngine {
  render(type: GmailCommunicationType, context: GmailTemplateContext): GmailRenderedTemplate {
    const copy = TEMPLATE_COPY[type];
    const recipient = type === "INTERNAL_NOTIFICATION" ? context.staffName : context.customer.customerName;
    if (!recipient) throw new Error("La plantilla requiere un destinatario conocido.");
    const eventType = context.eventTypeId ? getEventType(context.eventTypeId).name : context.customer.knownInformation.eventType;
    const service = context.serviceId ? getService(context.serviceId).name : context.customer.knownInformation.selectedService;
    const countdown = context.timeIntelligence?.countdown.label;
    const operationalMessage = context.operationalMessage ?? copy.message;
    const details = [eventType, service, countdown].filter(Boolean).join(" · ");
    const portal = context.portalUrl ? `Continúa desde tu portal permanente: ${context.portalUrl}` : "";
    const textBody = [`Hola ${recipient},`, operationalMessage, details, portal, "Equipo BOOMBOX"].filter(Boolean).join("\n\n");
    return {
      type,
      subject: copy.subject,
      textBody,
      htmlBody: `<main><img src="${OFFICIAL_ORBIT_LOGO_PATH}" alt="ORBIT v1.0" width="320" /><p>Hola ${escapeHtml(recipient)},</p><h1>${escapeHtml(copy.headline)}</h1><p>${escapeHtml(operationalMessage)}</p>${details ? `<p>${escapeHtml(details)}</p>` : ""}${portal ? `<p>${escapeHtml(portal)}</p>` : ""}<p>Equipo BOOMBOX</p></main>`,
    };
  }
}

export const GMAIL_TEMPLATE_TYPES = Object.keys(TEMPLATE_COPY) as readonly GmailCommunicationType[];
