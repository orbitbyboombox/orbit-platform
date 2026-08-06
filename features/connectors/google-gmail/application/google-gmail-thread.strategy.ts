import type { GmailDriveAttachmentReference, GmailThreadReference } from "../types/google-gmail-live.types";

export function resolveCustomerThread(customerId: string, existing?: GmailThreadReference | null): GmailThreadReference {
  if (existing && existing.customerId === customerId) return existing;
  return { customerId };
}

export function deduplicateDriveAttachments(attachments: readonly GmailDriveAttachmentReference[] = []) {
  return [...new Map(attachments.map((attachment) => [attachment.driveFileId, attachment])).values()];
}
