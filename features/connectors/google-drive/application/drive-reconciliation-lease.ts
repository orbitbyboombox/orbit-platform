import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export async function withDriveReconciliationLease<T>(scope: string, run: () => Promise<T>): Promise<T> {
  const admin = createAdminClient();
  const p_owner = randomUUID();
  const args = { p_scope: scope, p_owner };
  const { data, error } = await admin.rpc("claim_drive_reconciliation_lease", args);
  if (error) throw new Error("No fue posible confirmar el bloqueo de sincronización de Drive.");
  if (data !== true) throw new Error("Ya hay una sincronización de Drive en curso. Vuelve a intentar.");
  try {
    return await run();
  } finally {
    const { error: releaseError } = await admin.rpc("release_drive_reconciliation_lease", args);
    if (releaseError) console.error("Drive lease release failed", scope, releaseError.code);
  }
}
