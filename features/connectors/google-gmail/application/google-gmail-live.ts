import type { GoogleWorkspaceConnection } from "../../google-workspace";
import type { GoogleGmailLiveProvider } from "../provider/google-gmail-live.provider";
import type { GoogleGmailThreadRepository } from "../repository/google-gmail-thread.repository";
import { GoogleGmailTemplateEngine } from "../templates/google-gmail-template.engine";
import type { CustomerEmailTimelineEventType, GmailCommunicationRequest, GmailSendResult } from "../types/google-gmail-live.types";
import { deduplicateDriveAttachments, resolveCustomerThread } from "./google-gmail-thread.strategy";

const TIMELINE_EVENT: Record<GmailCommunicationRequest["type"], CustomerEmailTimelineEventType> = {
  QUOTATION: "QUOTATION_SENT", CONTRACT: "CONTRACT_SENT", RESERVATION_CONFIRMATION: "RESERVATION_CONFIRMATION_SENT", PAYMENT_CONFIRMATION: "PAYMENT_CONFIRMATION_SENT", REMINDER: "REMINDER_SENT", FINAL_CONFIRMATION: "FINAL_CONFIRMATION_SENT", INTERNAL_NOTIFICATION: "INTERNAL_NOTIFICATION_SENT",
};

export class GoogleGmailLive {
  constructor(private readonly workspace: GoogleWorkspaceConnection, private readonly provider: GoogleGmailLiveProvider, private readonly repository: GoogleGmailThreadRepository, private readonly templates = new GoogleGmailTemplateEngine()) {}

  async generateAndSend(request: GmailCommunicationRequest, sentAt: string): Promise<GmailSendResult> {
    if (this.workspace.connectionStatus !== "CONNECTED" || this.workspace.health !== "HEALTHY") return { ok: false, status: "FAILED", error: { code: "WORKSPACE_UNAVAILABLE", message: "Google Workspace no está disponible.", retryable: true } };
    if (!this.workspace.grantedServices.some((service) => service.id === "GMAIL" && service.granted)) return { ok: false, status: "FAILED", error: { code: "GMAIL_SCOPE_MISSING", message: "Gmail no fue autorizado en Google Workspace.", retryable: false } };
    try {
      const template = this.templates.render(request.type, request.templateContext);
      const attachments = deduplicateDriveAttachments(request.attachments);
      const thread = resolveCustomerThread(request.customerId, await this.repository.findByCustomerId(request.customerId));
      const sent = await this.provider.send({ to: request.recipientEmail, subject: template.subject, textBody: template.textBody, htmlBody: template.htmlBody, threadId: thread.threadId, replyToMessageId: thread.lastMessageId, driveFileIds: attachments.map(({ driveFileId }) => driveFileId) });
      const communication = { id: request.id, customerId: request.customerId, threadId: sent.threadId, messageId: sent.messageId, type: request.type, recipientEmail: request.recipientEmail, status: "SENT" as const, subject: template.subject, sentAt, attachments };
      await this.repository.saveThread({ customerId: request.customerId, threadId: sent.threadId, lastMessageId: sent.messageId });
      await this.repository.saveCommunication(communication);
      return { ok: true, communication, timelineEvent: { customerId: request.customerId, communicationId: request.id, type: TIMELINE_EVENT[request.type], occurredAt: sentAt, description: `${template.subject} · Enviado` } };
    } catch (error) {
      return { ok: false, status: "FAILED", error: { code: error instanceof Error && error.message.includes("plantilla") ? "INVALID_TEMPLATE_CONTEXT" : "PROVIDER_ERROR", message: error instanceof Error ? error.message : "No fue posible generar la comunicación.", retryable: true } };
    }
  }
}
