"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getConnectorAdministrator } from "@/features/connectors/connector-administrator.guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { isReadOnlyVisualPreview } from "@/lib/supabase/environment-guard";

export async function startOrbitBackupAction() {
  const actor = await getConnectorAdministrator();
  if (!actor || isReadOnlyVisualPreview()) return { ok: false as const, error: "Acceso restringido." };

  const token = process.env.GITHUB_BACKUP_DISPATCH_TOKEN;
  if (!token) return { ok: false as const, error: "El disparador seguro de GitHub todavía no está configurado." };
  const client = createAdminClient();
  const id = randomUUID();
  const { error } = await client.from("orbit_backup_runs")
    .insert({ id, requested_by: actor.id, status: "PENDIENTE" });
  if (error) return { ok: false as const, error: error.code === "23505"
    ? "Ya existe un respaldo pendiente o en ejecución."
    : "No se pudo reservar la ejecución del respaldo." };

  const noteUnconfirmed = "GitHub no confirmó la solicitud. Revisa el historial antes de volver a intentar.";
  let response: Response;
  try {
    response = await fetch("https://api.github.com/repos/orbitbyboombox/orbit-platform/actions/workflows/orbit-supabase-backup.yml/dispatches", {
      method: "POST",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { confirmation: "BACKUP-ORBIT-2.1", backup_run_id: id } }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    await client.from("orbit_backup_runs").update({ error_code: "DISPATCH_UNCONFIRMED", error_message: noteUnconfirmed })
      .eq("id", id).eq("status", "PENDIENTE");
    revalidatePath("/settings/backups");
    return { ok: false as const, error: noteUnconfirmed };
  }

  if (!response.ok) {
    const rejected = response.status < 500 && response.status !== 408;
    const message = rejected ? `GitHub rechazó la solicitud de respaldo (HTTP ${response.status}).` : noteUnconfirmed;
    await client.from("orbit_backup_runs").update(rejected
      ? { status: "ERROR", error_code: "DISPATCH_REJECTED", error_message: message, completed_at: new Date().toISOString() }
      : { error_code: "DISPATCH_UNCONFIRMED", error_message: message }).eq("id", id).eq("status", "PENDIENTE");
    revalidatePath("/settings/backups");
    return { ok: false as const, error: message };
  }
  revalidatePath("/settings/backups");
  return { ok: true as const };
}
