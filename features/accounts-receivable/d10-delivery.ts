export type D10DeliveryOutcome = "SENT" | "SKIPPED" | "FAILED" | "PENDING";

/** Single-attempt outbox boundary. claim() must be backed by a unique key. */
export async function deliverClaimedD10(input: {
  claim: () => Promise<boolean>;
  sendOnce: () => Promise<{ messageId: string; threadId: string }>;
  markSent: (result: { messageId: string; threadId: string }) => Promise<void>;
  markPending?: (error: unknown) => Promise<void>;
  markFailed: (error: unknown) => Promise<void>;
}): Promise<D10DeliveryOutcome> {
  if (!(await input.claim())) return "SKIPPED";
  let result: { messageId: string; threadId: string };
  try {
    result = await input.sendOnce();
  } catch (error) {
    if (input.markPending && error instanceof Error && error.name === "GoogleGmailDeliveryOutcomeUnknownError") await input.markPending(error);
    else await input.markFailed(error);
    if (input.markPending && error instanceof Error && error.name === "GoogleGmailDeliveryOutcomeUnknownError") return "PENDING";
    return "FAILED";
  }
  // Gmail accepted the message. A history write error must never trigger a send retry.
  try { await input.markSent(result); } catch { /* remains durably claimed */ }
  return "SENT";
}
