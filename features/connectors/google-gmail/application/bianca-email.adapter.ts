import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BiancaActionRunRepository } from "../../whatsapp-cloud/bianca-action-runs.repository.ts";
import { actionRunIdempotencyKey } from "../../whatsapp-cloud/bianca-action-runs.ts";
import type { GoogleGmailLiveProvider, GoogleGmailProviderResult } from "../provider/google-gmail-live.provider";

export const BIANCA_EMAIL_TYPES = ["QUOTE", "CATALOG", "COMMERCIAL_INFORMATION"] as const;
export type BiancaEmailType = (typeof BIANCA_EMAIL_TYPES)[number];
export type BiancaEmailDeliveryMode = "MOCK" | "LIVE";

export type BiancaEmailEvidence = {
  actionRunId: string;
  emailType: BiancaEmailType;
  recipient: string;
  relatedQuoteId: string | null;
  providerMessageId: string;
  status: "SENT" | "ALREADY_DONE";
  sentAt: string;
  deliveryMode: BiancaEmailDeliveryMode;
};

export type BiancaEmailInput = {
  customerId: string;
  conversationId: string;
  opportunityId: string;
  source: "WHATSAPP_AGENT" | "WEB_AGENT";
  normalizedInputHash: string;
  emailType: BiancaEmailType;
  recipient: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  templateVersion: string;
  relatedQuoteId?: string | null;
};

type CommercialSend = {
  id: string;
  status: "PREPARING" | "SENT" | "FAILED";
  external_message_id: string | null;
  sent_at?: string | null;
};

function deterministicUuid(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 3) | 8).toString(16);
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20, 32)}`;
}

function emailIdempotencyKey(input: BiancaEmailInput) {
  return deterministicUuid([input.emailType, input.relatedQuoteId ?? "none", input.recipient.trim().toLowerCase(), input.templateVersion].join(":"));
}

function categoryForEmailType(type: BiancaEmailType) {
  if (type === "QUOTE") return "COMPANIES_QUOTE";
  return "COMPANIES_CATALOG";
}

function evidenceFromStored(input: BiancaEmailInput, actionRunId: string, stored: CommercialSend, deliveryMode: BiancaEmailDeliveryMode): BiancaEmailEvidence | null {
  if (stored.status !== "SENT" || !stored.external_message_id) return null;
  return {
    actionRunId,
    emailType: input.emailType,
    recipient: input.recipient.trim().toLowerCase(),
    relatedQuoteId: input.relatedQuoteId ?? null,
    providerMessageId: stored.external_message_id,
    status: "ALREADY_DONE",
    sentAt: stored.sent_at ?? new Date().toISOString(),
    deliveryMode,
  };
}

export class BiancaEmailAdapter {
  private readonly client: SupabaseClient;
  private readonly provider: GoogleGmailLiveProvider;
  private readonly deliveryMode: BiancaEmailDeliveryMode;

  constructor(
    client: SupabaseClient,
    provider: GoogleGmailLiveProvider,
    deliveryMode: BiancaEmailDeliveryMode,
  ) {
    this.client = client;
    this.provider = provider;
    this.deliveryMode = deliveryMode;
  }

  async send(input: BiancaEmailInput): Promise<BiancaEmailEvidence> {
    if (!BIANCA_EMAIL_TYPES.includes(input.emailType)) throw new Error("BIANCA_EMAIL_TYPE_NOT_ALLOWED");
    if (!/^\S+@\S+\.\S+$/.test(input.recipient.trim())) throw new Error("BIANCA_EMAIL_RECIPIENT_INVALID");
    const idempotencyKey = emailIdempotencyKey(input);
    const runs = new BiancaActionRunRepository(this.client);
    const claim = await runs.claim({
      customerId: input.customerId,
      conversationId: input.conversationId,
      opportunityId: input.opportunityId,
      actionType: "SEND_EMAIL",
      idempotencyKey: actionRunIdempotencyKey({
        customerId: input.customerId,
        conversationId: input.conversationId,
        opportunityId: input.opportunityId,
        actionType: "SEND_EMAIL",
        inputSummary: { emailIdempotencyKey: idempotencyKey, emailType: input.emailType, templateVersion: input.templateVersion },
        normalizedInputHash: idempotencyKey,
      }),
      inputSummary: { emailIdempotencyKey: idempotencyKey, emailType: input.emailType, templateVersion: input.templateVersion, relatedQuoteId: input.relatedQuoteId ?? null },
      actorType: "SYSTEM_AGENT",
      actorId: "BIANCA",
      source: input.source,
    });
    const existing = await this.client.from("commercial_sends").select("id,status,external_message_id,sent_at").eq("idempotency_key", idempotencyKey).maybeSingle<CommercialSend>();
    if (existing.error) throw existing.error;
    const reconciled = existing.data ? evidenceFromStored(input, claim.runId, existing.data, this.deliveryMode) : null;
    if (reconciled) {
      await runs.finish(claim.runId, { status: "SUCCESS", resultSummary: reconciled, externalRef: reconciled.providerMessageId });
      return reconciled;
    }
    if (claim.status === "ALREADY_DONE") {
      const run = await runs.findById(claim.runId);
      const result = run?.result_summary as BiancaEmailEvidence | null;
      if (result?.providerMessageId) return { ...result, status: "ALREADY_DONE", actionRunId: claim.runId };
      throw new Error("BIANCA_EMAIL_EVIDENCE_MISSING");
    }
    if (claim.status !== "CLAIMED") throw new Error("BIANCA_EMAIL_ACTION_RUNNING");

    let sendId: string | null = null;
    try {
      const claimed = await this.client.from("commercial_sends").insert({
        idempotency_key: idempotencyKey,
        recipient_email: input.recipient.trim().toLowerCase(),
        category: categoryForEmailType(input.emailType),
        quotation_id: input.relatedQuoteId ?? null,
        customer_id: input.customerId,
        subject: input.subject,
        body_snapshot: input.textBody,
        document_snapshot: { emailType: input.emailType, templateVersion: input.templateVersion, deliveryMode: this.deliveryMode },
        status: "PREPARING",
      }).select("id").single<{ id: string }>();
      if (claimed.error) {
        const raced = await this.client.from("commercial_sends").select("id,status,external_message_id,sent_at").eq("idempotency_key", idempotencyKey).maybeSingle<CommercialSend>();
        if (raced.error) throw claimed.error;
        const racedEvidence = raced.data ? evidenceFromStored(input, claim.runId, raced.data, this.deliveryMode) : null;
        if (racedEvidence) {
          await runs.finish(claim.runId, { status: "SUCCESS", resultSummary: racedEvidence, externalRef: racedEvidence.providerMessageId });
          return racedEvidence;
        }
        throw claimed.error;
      }
      sendId = claimed.data?.id ?? null;
      if (!sendId) throw new Error("BIANCA_EMAIL_CLAIM_NOT_VERIFIABLE");
      const delivered: GoogleGmailProviderResult = await this.provider.send({ to: input.recipient.trim().toLowerCase(), idempotencyKey, subject: input.subject, textBody: input.textBody, htmlBody: input.htmlBody, driveFileIds: [] });
      const sentAt = new Date().toISOString();
      const evidence: BiancaEmailEvidence = { actionRunId: claim.runId, emailType: input.emailType, recipient: input.recipient.trim().toLowerCase(), relatedQuoteId: input.relatedQuoteId ?? null, providerMessageId: delivered.messageId, status: "SENT", sentAt, deliveryMode: this.deliveryMode };
      const finished = await this.client.from("commercial_sends").update({ status: "SENT", external_message_id: delivered.messageId, sent_at: sentAt }).eq("id", sendId);
      if (finished.error) throw finished.error;
      await runs.finish(claim.runId, { status: "SUCCESS", resultSummary: evidence, externalRef: delivered.messageId });
      return evidence;
    } catch (error) {
      if (sendId) await this.client.from("commercial_sends").update({ status: "FAILED" }).eq("id", sendId);
      await runs.finish(claim.runId, { status: "FAILED", errorCode: "RETRYABLE" });
      throw error;
    }
  }
}
