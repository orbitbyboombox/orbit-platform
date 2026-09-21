import type { SupabaseClient } from "@supabase/supabase-js";

export const BIANCA_RUNTIME_VERSION = "v4" as const;
export type BiancaRuntimeContractState = "RESPONSE_SENT" | "WAITING_HUMAN" | "INTENTIONALLY_SILENT" | "FAILED";

type CertificationPatch = {
  conversation_id?: string | null;
  customer_id?: string | null;
  opportunity_id?: string | null;
  source?: string | null;
  intents?: readonly string[];
  requested_action?: string | null;
  confidence?: number | null;
  webhook_received_at?: string | null;
  processing_started_at?: string | null;
  parser_done_at?: string | null;
  ai_started_at?: string | null;
  ai_completed_at?: string | null;
  evidence_done_at?: string | null;
  outbox_created_at?: string | null;
  meta_sent_at?: string | null;
  delivered_at?: string | null;
  final_contract_state?: BiancaRuntimeContractState;
  failure_code?: string | null;
  failure_detail?: string | null;
};

export async function createBiancaLiveRuntimeCertification(input: {
  client: SupabaseClient;
  providerMessageId: string;
  webhookReceivedAt: string;
  processingStartedAt: string;
}) {
  const { data, error } = await input.client.from("bianca_live_runtime_certifications").upsert({
    tenant_slug: "boombox",
    provider_message_id: input.providerMessageId,
    runtime_version: BIANCA_RUNTIME_VERSION,
    webhook_received_at: input.webhookReceivedAt,
    processing_started_at: input.processingStartedAt,
    updated_at: input.processingStartedAt,
  }, { onConflict: "tenant_slug,provider_message_id" }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function updateBiancaLiveRuntimeCertification(input: {
  client: SupabaseClient;
  providerMessageId: string;
  patch: CertificationPatch;
}) {
  const payload: Record<string, unknown> = { ...input.patch, updated_at: new Date().toISOString() };
  if (input.patch.intents) payload.intents = input.patch.intents;
  const { error } = await input.client.from("bianca_live_runtime_certifications")
    .update(payload)
    .eq("tenant_slug", "boombox")
    .eq("provider_message_id", input.providerMessageId);
  if (error) throw error;
}

export async function finalizeBiancaLiveRuntimeCertification(input: {
  client: SupabaseClient;
  providerMessageId: string;
  state: BiancaRuntimeContractState;
  failureCode?: string | null;
  failureDetail?: string | null;
}) {
  await updateBiancaLiveRuntimeCertification({
    client: input.client,
    providerMessageId: input.providerMessageId,
    patch: {
      final_contract_state: input.state,
      failure_code: input.failureCode ?? null,
      failure_detail: input.failureDetail ?? null,
    },
  });
}

export async function markBiancaLiveRuntimeMetaSent(client: SupabaseClient, inboundProviderMessageId: string, sentAt = new Date().toISOString()) {
  await updateBiancaLiveRuntimeCertification({ client, providerMessageId: inboundProviderMessageId, patch: { meta_sent_at: sentAt } });
}

export async function markBiancaLiveRuntimeDelivered(client: SupabaseClient, inboundProviderMessageId: string, deliveredAt = new Date().toISOString()) {
  await updateBiancaLiveRuntimeCertification({ client, providerMessageId: inboundProviderMessageId, patch: { delivered_at: deliveredAt } });
}

export async function markStalledBiancaRuntimeOutboxes(client: SupabaseClient, ageSeconds = 60) {
  const { data, error } = await client.rpc("bianca_mark_stalled_runtime_outboxes", { p_age_seconds: ageSeconds });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function getBiancaLiveRuntimeSummary(client: SupabaseClient, since?: string) {
  let query = client.from("bianca_live_runtime_certifications").select("final_contract_state,webhook_received_at,meta_sent_at,delivered_at,failure_code").not("final_contract_state", "is", null);
  if (since) query = query.gte("created_at", since);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Array<{ final_contract_state: BiancaRuntimeContractState; webhook_received_at: string | null; meta_sent_at: string | null; delivered_at: string | null; failure_code: string | null }>;
  const percentile = (values: number[], p: number) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  };
  const latency = (end: keyof typeof rows[number]) => rows.flatMap((row) => row.webhook_received_at && row[end] ? [Math.max(0, new Date(row[end] as string).getTime() - new Date(row.webhook_received_at).getTime())] : []);
  const toMeta = latency("meta_sent_at");
  const toDelivered = latency("delivered_at");
  const responseRows = rows.filter((row) => row.final_contract_state === "RESPONSE_SENT");
  return {
    LIVE_MESSAGES: rows.length,
    RESPONSE_SENT: responseRows.length,
    WAITING_HUMAN: rows.filter((row) => row.final_contract_state === "WAITING_HUMAN").length,
    INTENTIONALLY_SILENT: rows.filter((row) => row.final_contract_state === "INTENTIONALLY_SILENT").length,
    FAILED: rows.filter((row) => row.final_contract_state === "FAILED").length,
    ORPHAN_PENDING: rows.filter((row) => row.failure_code === "DELIVERY_STALLED").length,
    P50_INBOUND_TO_META: percentile(toMeta, 0.5),
    P95_INBOUND_TO_META: percentile(toMeta, 0.95),
    P50_INBOUND_TO_DELIVERED: percentile(toDelivered, 0.5),
    P95_INBOUND_TO_DELIVERED: percentile(toDelivered, 0.95),
    META_SEND_SUCCESS_RATE: responseRows.length ? responseRows.filter((row) => Boolean(row.meta_sent_at)).length / responseRows.length : null,
    DELIVERY_SUCCESS_RATE: responseRows.length ? responseRows.filter((row) => Boolean(row.delivered_at)).length / responseRows.length : null,
    ACCIDENTAL_HANDOFF_RATE: rows.length ? rows.filter((row) => row.final_contract_state === "WAITING_HUMAN" && row.failure_code === "ACCIDENTAL_HANDOFF").length / rows.length : null,
  };
}
