import type { SupabaseClient } from "@supabase/supabase-js";
import type { BiancaActionRunInput, BiancaActionRunResult, BiancaActionRunStatus } from "./bianca-action-runs.ts";

type ActionRunRow = {
  id: string;
  status: BiancaActionRunStatus;
  result_summary: Record<string, unknown> | null;
  external_ref: string | null;
  error_code: string | null;
};

export class BiancaActionRunRepository {
  private readonly client: SupabaseClient;
  private readonly tenantSlug: string;

  constructor(client: SupabaseClient, tenantSlug = "boombox") {
    this.client = client;
    this.tenantSlug = tenantSlug;
  }

  async findByIdempotencyKey(key: string) {
    const { data, error } = await this.client
      .from("bianca_action_runs")
      .select("id,status,result_summary,external_ref,error_code")
      .eq("tenant_slug", this.tenantSlug)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error) throw error;
    return (data as ActionRunRow | null) ?? null;
  }

  async findById(runId: string) {
    const { data, error } = await this.client
      .from("bianca_action_runs")
      .select("id,status,result_summary,external_ref,error_code")
      .eq("tenant_slug", this.tenantSlug)
      .eq("id", runId)
      .maybeSingle();
    if (error) throw error;
    return (data as ActionRunRow | null) ?? null;
  }

  async claim(input: BiancaActionRunInput): Promise<{ status: "CLAIMED" | "ALREADY_RUNNING" | "ALREADY_DONE"; runId: string }> {
    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (existing?.status === "SUCCESS" || existing?.status === "ALREADY_DONE") return { status: "ALREADY_DONE", runId: existing.id };
    if (existing?.status === "RUNNING" || existing?.status === "PENDING") return { status: "ALREADY_RUNNING", runId: existing.id };
    if (existing?.status === "FAILED" && existing.error_code !== "RETRYABLE") return { status: "ALREADY_RUNNING", runId: existing.id };

    const { data, error } = await this.client.from("bianca_action_runs").upsert({
      tenant_slug: this.tenantSlug,
      customer_id: input.customerId,
      conversation_id: input.conversationId,
      opportunity_id: input.opportunityId,
      action_type: input.actionType,
      actor_type: input.actorType,
      actor_id: input.actorId,
      source: input.source,
      action_version: input.actionVersion ?? "v1",
      idempotency_key: input.idempotencyKey,
      status: "RUNNING",
      input_summary: input.inputSummary,
      started_at: new Date().toISOString(),
      retry_count: 0,
    }, { onConflict: "tenant_slug,idempotency_key", ignoreDuplicates: false }).select("id,status").single();
    if (error) throw error;
    if (data.status !== "RUNNING") return { status: "ALREADY_RUNNING", runId: data.id };
    return { status: "CLAIMED", runId: data.id };
  }

  async finish(runId: string, result: BiancaActionRunResult) {
    const { error } = await this.client.from("bianca_action_runs").update({
      status: result.status,
      result_summary: result.resultSummary ?? {},
      external_ref: result.externalRef ?? null,
      error_code: result.errorCode ?? null,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    if (error) throw error;
  }
}
