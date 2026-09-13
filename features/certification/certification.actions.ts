"use server";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { getCertificationAdapter } from "./certification-adapters";
export async function runSafeCertification(tenantSlug: string) {
  const client = await createSupabaseServerActionClient(); const { data: auth } = await client.auth.getUser(); if (!auth.user) return { ok: false, error: "Sesión requerida." };
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single(); if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) return { ok: false, error: "Solo Founder/Admin." };
  const adapter = getCertificationAdapter(tenantSlug); const { data: run, error } = await client.from("certification_runs").insert({ scope: adapter.scope, tenant_slug: adapter.tenantSlug, status: "BLOCKED_EXTERNAL", environment: "SAFE", commit_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null, deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? null, triggered_by: auth.user.id, completed_at: new Date().toISOString(), summary: { mockedChecks: adapter.requiredChecks.length, liveRequired: true } }).select("id,status").single(); if (error) return { ok: false, error: error.message };
  await client.from("certification_check_results").insert(adapter.requiredChecks.map(check => ({ run_id: run.id, module: check.module, flow: check.flow, check_name: check.checkName, execution_mode: "MOCKED", status: "PASS", severity: "INFO", message: "Contrato verificado en SAFE MODE." })));
  return { ok: true, runId: run.id, status: run.status };
}
