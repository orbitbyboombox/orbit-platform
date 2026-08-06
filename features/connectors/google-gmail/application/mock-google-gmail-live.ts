import type { CustomerConversationContext } from "@/features/customer-memory";
import type { GmailCommunicationRecord, GmailCommunicationRecommendation } from "../types/google-gmail-live.types";
import { GoogleGmailTemplateEngine } from "../templates/google-gmail-template.engine";

export const MOCK_GMAIL_CUSTOMER: CustomerConversationContext = {
  customerId: "customer-maria-gonzalez",
  customerName: "María González",
  knownInformation: { eventType: "Matrimonio", eventDate: "2027-09-14", eventLocation: "CasaPiedra", selectedService: "BBOX360", quotationStatus: "SENT", reservationStatus: "PENDING", paymentStatus: "NOT_STARTED", portalStatus: "ACTIVE" },
  confirmedInformation: ["customerName", "eventType", "eventDate", "eventLocation", "selectedService"],
  missingInformation: [], quotationStatus: "SENT", reservationStatus: "PENDING", paymentStatus: "NOT_STARTED", portalStatus: "ACTIVE", isConversationReady: true,
};

export const MOCK_GMAIL_TEMPLATE = new GoogleGmailTemplateEngine().render("CONTRACT", { customer: MOCK_GMAIL_CUSTOMER, eventTypeId: "WEDDING", serviceId: "BBOX360", portalUrl: "https://orbit.boom-box.cl/p/BBX-27-000184" });

export const MOCK_GMAIL_COMMUNICATIONS: readonly GmailCommunicationRecord[] = [
  { id: "mail-003", customerId: MOCK_GMAIL_CUSTOMER.customerId, threadId: "gmail-thread-customer-maria", messageId: "gmail-message-003", type: "CONTRACT", recipientEmail: "maria@example.com", status: "DELIVERED", subject: MOCK_GMAIL_TEMPLATE.subject, sentAt: "5 agosto 2026 · 17:40", attachments: [{ driveFileId: "drive-contract-184", name: "Contrato BOOMBOX.pdf", mimeType: "application/pdf", drivePath: "BOOMBOX ORBIT/CLIENTES/2027/María González - 2027-09-14/01 Contrato" }] },
  { id: "mail-002", customerId: MOCK_GMAIL_CUSTOMER.customerId, threadId: "gmail-thread-customer-maria", messageId: "gmail-message-002", type: "QUOTATION", recipientEmail: "maria@example.com", status: "DELIVERED", subject: "Tu cotización BOOMBOX", sentAt: "4 agosto 2026 · 10:15", attachments: [] },
] as const;

export const MOCK_GMAIL_RECOMMENDATION: GmailCommunicationRecommendation = { title: "Enviar contrato ahora.", reason: "La cotización fue aceptada y el cliente espera el acuerdo para continuar.", actionLabel: "Preparar contrato", priority: "WARNING" };
export const MOCK_GMAIL_METRICS = { pending: 3, failed: 1, lastCommunication: "Hoy · 17:40" } as const;
