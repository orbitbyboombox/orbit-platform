import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkMercadoPagoApiHealth } from "./mercadopago.service";

export async function recordMercadoPagoHealthSnapshot() {
  const result = await checkMercadoPagoApiHealth();
  const healthy = result.modeValid && result.accessTokenPresent && result.webhookSecretConfigured && result.apiAuth;
  const status = healthy ? "HEALTHY" : "CRITICAL";
  const services = [{
    label: "Mercado Pago",
    status,
    value: healthy ? "API autenticada y disponible" : "Configuración o API no disponible",
    detail: `mode=${result.mode} · http=${result.status ?? "none"} · token=${result.accessTokenPresent ? "present" : "missing"} · webhookSecret=${result.webhookSecretConfigured ? "present" : "missing"}`,
  }];
  const checkedAt = new Date().toISOString();
  const { error } = await createAdminClient().from("system_health_checks").insert({
    overall_status: status,
    overall_score: healthy ? 100 : 0,
    scores: [{ label: "Mercado Pago", value: healthy ? 100 : 0 }],
    services,
    deployment_ref: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_URL ?? "production",
    created_by: null,
    checked_at: checkedAt,
  });
  if (error) throw error;
  return { ...result, healthy, checkedAt };
}
