import type { EventTypeId, ServiceId } from "@/features/business-core";
import type { CustomerConversationContext } from "@/features/customer-memory";
import type { EventTimeIntelligence } from "@/features/time-intelligence";

export type GmailCommunicationType = "QUOTATION" | "CONTRACT" | "RESERVATION_CONFIRMATION" | "PAYMENT_CONFIRMATION" | "REMINDER" | "FINAL_CONFIRMATION" | "INTERNAL_NOTIFICATION";
export type GmailCommunicationStatus = "PENDING" | "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "OPENED";
export type GmailRecipientKind = "CUSTOMER" | "STAFF" | "INTERNAL";

export interface GmailDriveAttachmentReference {
  driveFileId: string;
  name: string;
  mimeType: "application/pdf" | string;
  drivePath: string;
}

export interface GmailTemplateContext {
  customer: CustomerConversationContext;
  timeIntelligence?: EventTimeIntelligence;
  eventTypeId?: EventTypeId;
  serviceId?: ServiceId;
  portalUrl?: string;
  commercialSummary?: readonly string[];
  staffName?: string;
  operationalMessage?: string;
}

export interface GmailRenderedTemplate {
  type: GmailCommunicationType;
  subject: string;
  textBody: string;
  htmlBody: string;
}

export interface GmailCommunicationRequest {
  id: string;
  customerId: string;
  recipientEmail: string;
  recipientKind: GmailRecipientKind;
  type: GmailCommunicationType;
  templateContext: GmailTemplateContext;
  attachments?: readonly GmailDriveAttachmentReference[];
}

export interface GmailThreadReference {
  customerId: string;
  threadId?: string;
  lastMessageId?: string;
}

export interface GmailCommunicationRecord {
  id: string;
  customerId: string;
  threadId: string;
  messageId: string;
  type: GmailCommunicationType;
  recipientEmail: string;
  status: GmailCommunicationStatus;
  subject: string;
  sentAt: string;
  attachments: readonly GmailDriveAttachmentReference[];
}

export type CustomerEmailTimelineEventType = "QUOTATION_SENT" | "CONTRACT_SENT" | "RESERVATION_CONFIRMATION_SENT" | "PAYMENT_CONFIRMATION_SENT" | "REMINDER_SENT" | "FINAL_CONFIRMATION_SENT" | "INTERNAL_NOTIFICATION_SENT";

export interface CustomerEmailTimelineEvent {
  customerId: string;
  communicationId: string;
  type: CustomerEmailTimelineEventType;
  occurredAt: string;
  description: string;
}

export interface GmailCommunicationRecommendation {
  title: string;
  reason: string;
  actionLabel: string;
  priority: "INFO" | "WARNING" | "CRITICAL";
}

export type GmailLiveErrorCode = "WORKSPACE_UNAVAILABLE" | "GMAIL_SCOPE_MISSING" | "INVALID_TEMPLATE_CONTEXT" | "PROVIDER_ERROR";
export interface GmailLiveError { code: GmailLiveErrorCode; message: string; retryable: boolean; }

export type GmailSendResult =
  | { ok: true; communication: GmailCommunicationRecord; timelineEvent: CustomerEmailTimelineEvent }
  | { ok: false; status: "FAILED"; error: GmailLiveError };
