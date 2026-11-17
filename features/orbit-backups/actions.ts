"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const REPOSITORY = "orbitbyboombox/orbit-platform";
const WORKFLOW = "orbit-supabase-backup.yml";
const CONFIRMATION = "BACKUP-ORBIT-2.1";

async function administratorContext() {
  const client = await createSupabaseServerClient();
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) throw error ?? new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle<{ role: string }>();
  if (profileError) throw profileError;
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role))
    throw new Error("Solo Founder o Administración puede ejecutar respaldos.");
  return { client, userId: auth.user.id };
}

export async function startOrbitBackupAction() {
  try {
    const { client, userId } = await administratorContext();
    const id = randomUUID();
    const created = await client
      .from("orbit_backup_runs")
      .insert({ id, requested_by: userId, status: "EN_PROCESO", started_at: new Date().toISOString() })
      .select("id")
      .single();
    if (created.error) {
      if (created.error.code === "23505")
        throw new Error("Ya existe un respaldo en proceso. Espera su resultado antes de iniciar otro.");
      throw created.error;
    }

    const token = process.env.GITHUB_BACKUP_DISPATCH_TOKEN;
    if (!token) {
      await client.from("orbit_backup_runs").update({ status: "ERROR", error_code: "CONFIGURATION_MISSING", error_message: "El disparador seguro de GitHub no está configurado." }).eq("id", id);
      throw new Error("El módulo está instalado, pero falta configurar el disparador seguro de GitHub.");
    }

    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: process.env.ORBIT_BACKUP_REF ?? "main",
        inputs: { confirmation: CONFIRMATION, backup_run_id: id },
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      const reason = `GitHub rechazó el inicio del respaldo (${response.status}).`;
      await client.from("orbit_backup_runs").update({ status: "ERROR", error_code: "WORKFLOW_DISPATCH_FAILED", error_message: reason }).eq("id", id);
      throw new Error(reason);
    }
    revalidatePath("/settings");
    return { ok: true as const, id };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible iniciar el respaldo." };
  }
}
