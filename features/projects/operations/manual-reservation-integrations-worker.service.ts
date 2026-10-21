import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { continueManualReservationIntegrations } from "../actions/customer.actions";

const WORKER_BATCH_SIZE = 10;
const MAX_INTEGRATION_ATTEMPTS = 8;

type PendingTransaction = {
  id: string;
  project_id: string;
  actor_id: string;
  integration_attempt_count: number | null;
};

export async function processPendingManualReservationIntegrations(
  client: SupabaseClient,
) {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("reservation_transactions")
    .select("id,project_id,actor_id,integration_attempt_count")
    .eq("reservation_method", "MANUAL")
    .in("status", ["CREATED", "PROCESSING", "FAILED"])
    .not("project_id", "is", null)
    .lt("integration_attempt_count", MAX_INTEGRATION_ATTEMPTS)
    .or(`integration_next_attempt_at.is.null,integration_next_attempt_at.lte.${now}`)
    .order("updated_at", { ascending: true })
    .limit(WORKER_BATCH_SIZE);
  if (error) throw error;

  const results: Array<Record<string, unknown>> = [];
  for (const transaction of (data ?? []) as PendingTransaction[]) {
    const startedAt = Date.now();
    try {
      const result = await continueManualReservationIntegrations({
        client,
        transactionId: transaction.id,
        projectId: transaction.project_id,
        actorId: transaction.actor_id,
        internalWorker: true,
      });
      results.push({
        transactionId: transaction.id,
        projectId: transaction.project_id,
        status: result?.status ?? "SKIPPED",
        durationMs: Date.now() - startedAt,
        warnings: result?.warnings?.map((warning) => warning.stage) ?? [],
        customerEmailSuppressed: true,
      });
    } catch (error) {
      results.push({
        transactionId: transaction.id,
        projectId: transaction.project_id,
        status: "FAILED",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Worker stage failed",
        customerEmailSuppressed: true,
      });
    }
  }

  return {
    scanned: data?.length ?? 0,
    processed: results.length,
    results,
    maxAttempts: MAX_INTEGRATION_ATTEMPTS,
  };
}
