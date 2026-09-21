import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BiancaActionRunRepository } from "./bianca-action-runs.repository.ts";
import { actionRunIdempotencyKey } from "./bianca-action-runs.ts";

export type BiancaReservationStartInput = {
  customerId: string;
  conversationId: string;
  opportunityId: string;
  source: "WHATSAPP_AGENT" | "WEB_AGENT";
  customerEmail?: string;
  eventDate?: string;
  eventTime?: string;
  commune?: string;
  venue?: string;
  serviceCode?: string;
  durationHours?: number;
};

export type BiancaReservationStartEvidence = {
  actionRunId: string;
  reservationId: string;
  status: "STARTED" | "ALREADY_DONE";
  startedAt: string;
  deliveryMode: "MOCK" | "LIVE";
};

export type BiancaReservationStartResult =
  | { status: "NEEDS_INFORMATION"; missingFields: string[] }
  | BiancaReservationStartEvidence & { url: string | null };

type ReservationStarter = (input: BiancaReservationStartInput) => Promise<{ reservationId: string; url: string | null }>;

function fingerprint(input: BiancaReservationStartInput) {
  return createHash("sha256").update(JSON.stringify({
    customerId: input.customerId,
    opportunityId: input.opportunityId,
    customerEmail: input.customerEmail?.trim().toLowerCase() ?? "",
    eventDate: input.eventDate?.trim() ?? "",
    eventTime: input.eventTime?.trim() ?? "",
    commune: input.commune?.trim().toLowerCase() ?? "",
    venue: input.venue?.trim().toLowerCase() ?? "",
    serviceCode: input.serviceCode?.trim().toUpperCase() ?? "",
    durationHours: input.durationHours ?? null,
  })).digest("hex");
}

function missingFields(input: BiancaReservationStartInput) {
  return [
    !input.customerEmail && "customerEmail",
    !input.eventDate && "eventDate",
    !input.eventTime && "eventTime",
    !input.commune && "commune",
    !input.venue && "venue",
    !input.serviceCode && "serviceCode",
    (!input.durationHours || input.durationHours < 1) && "durationHours",
  ].filter(Boolean) as string[];
}

export class BiancaReservationStartAdapter {
  private readonly starter: ReservationStarter;
  private readonly deliveryMode: "MOCK" | "LIVE";

  constructor(client: SupabaseClient, starter: ReservationStarter, deliveryMode: "MOCK" | "LIVE") {
    this.client = client;
    this.starter = starter;
    this.deliveryMode = deliveryMode;
  }

  private readonly client: SupabaseClient;

  async start(input: BiancaReservationStartInput): Promise<BiancaReservationStartResult> {
    const missing = missingFields(input);
    if (missing.length) return { status: "NEEDS_INFORMATION", missingFields: missing };
    const runs = new BiancaActionRunRepository(this.client);
    const idempotencyKey = actionRunIdempotencyKey({
      customerId: input.customerId,
      conversationId: input.conversationId,
      opportunityId: input.opportunityId,
      actionType: "RESERVATION_START",
      inputSummary: { fingerprint: fingerprint(input) },
      normalizedInputHash: fingerprint(input),
    });
    const claim = await runs.claim({
      customerId: input.customerId,
      conversationId: input.conversationId,
      opportunityId: input.opportunityId,
      actionType: "RESERVATION_START",
      idempotencyKey,
      inputSummary: { fingerprint: fingerprint(input) },
      actorType: "SYSTEM_AGENT",
      actorId: "BIANCA",
      source: input.source,
    });
    if (claim.status === "ALREADY_DONE") {
      const run = await runs.findById(claim.runId);
      const evidence = run?.result_summary as BiancaReservationStartEvidence & { url?: string | null } | null;
      if (evidence?.reservationId) return { ...evidence, actionRunId: claim.runId, status: "ALREADY_DONE", url: evidence.url ?? null };
      throw new Error("BIANCA_RESERVATION_EVIDENCE_MISSING");
    }
    if (claim.status !== "CLAIMED") throw new Error("BIANCA_RESERVATION_ACTION_RUNNING");
    try {
      const started = await this.starter(input);
      const evidence: BiancaReservationStartEvidence & { url: string | null } = { actionRunId: claim.runId, reservationId: started.reservationId, status: "STARTED", startedAt: new Date().toISOString(), deliveryMode: this.deliveryMode, url: started.url };
      await runs.finish(claim.runId, { status: "SUCCESS", resultSummary: evidence, externalRef: started.reservationId });
      return evidence;
    } catch (error) {
      await runs.finish(claim.runId, { status: "FAILED", errorCode: "RETRYABLE" });
      throw error;
    }
  }
}
