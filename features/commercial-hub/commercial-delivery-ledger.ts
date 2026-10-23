export type GmailAcceptance = {
  messageId: string;
  threadId: string;
};

export function isCommercialSendAccepted(status: string | null | undefined) {
  return status === "SENT" || status === "GMAIL_ACCEPTED";
}

export function buildGmailAcceptancePatch(
  accepted: GmailAcceptance,
  providerAccount?: string,
  acceptedAt = new Date().toISOString(),
  reconciliationRequired = false,
) {
  return {
    status: "GMAIL_ACCEPTED" as const,
    external_message_id: accepted.messageId,
    provider_thread_id: accepted.threadId,
    provider_account: providerAccount ?? null,
    provider_accepted_at: acceptedAt,
    provider_response: {
      accepted: true,
      messageId: accepted.messageId,
      threadId: accepted.threadId,
      ...(reconciliationRequired ? { reconciliationRequired: true } : {}),
    },
    attempt_count: 1,
  };
}
