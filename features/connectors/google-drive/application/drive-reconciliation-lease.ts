import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export async function withDriveReconciliationLease<T>(scope: string, run: () => Promise<T>, waitForRelease = false): Promise<T> {
  const admin = createAdminClient();
  const p_owner = randomUUID();
  const args = { p_scope: scope, p_owner };
  const retryDelays = waitForRelease ? [0, 500, 1_000, 2_000] : [0];
  let acquired = false;
  for (const delay of retryDelays) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const { data, error } = await admin.rpc("claim_drive_reconciliation_lease", args);
    if (error) throw new Error("No fue posible confirmar el bloqueo de sincronización de Drive.");
    if (data === true) { acquired = true; break; }
  }
  if (!acquired) throw new Error("Drive sigue ocupado con otra sincronización. No se inició una ejecución paralela.");
  try {
    return await run();
  } finally {
    const { error: releaseError } = await admin.rpc("release_drive_reconciliation_lease", args);
    if (releaseError) console.error("Drive lease release failed", scope, releaseError.code);
  }
}
