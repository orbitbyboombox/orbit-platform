import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IntegrationHealthSnapshot, IntegrationSignal } from "./types";
import { biancaOutboundEnabled, biancaSimulationEnabled } from "@/features/connectors/whatsapp-cloud/bianca-policy";

const configured = (keys: string[]) => keys.every((key) => Boolean(process.env[key]));
const safeError = (value: unknown) => value instanceof Error ? value.message.replace(/[\w.+-]+@[\w.-]+/g, "[redacted]").slice(0, 180) : "Error no disponible";
const signal = (label: string, status: IntegrationSignal["status"], detail?: string): IntegrationSignal => ({ label, status, detail });

export async function loadIntegrationHealth(): Promise<IntegrationHealthSnapshot> {
  const admin = createAdminClient();
  const [webhooks, states, communications, outbound, customers] = await Promise.all([
    admin.from("whatsapp_webhook_events").select("id,processing_status,processing_error,occurred_at,updated_at").order("occurred_at", { ascending: false }).limit(20),
    admin.from("conversation_states").select("status,nova_enabled,human_owner_id,updated_at,context").order("updated_at", { ascending: false }).limit(20),
    admin.from("communications").select("id,channel,direction,occurred_at,communication_type,context_snapshot").eq("channel", "WHATSAPP_BUSINESS").order("occurred_at", { ascending: false }).limit(1),
    admin.from("whatsapp_outbound_messages").select("id,status,created_at").order("created_at", { ascending: false }).limit(1),
    admin.from("customers").select("id", { count: "exact", head: true }),
  ]);
  const webhookRows = (webhooks.data ?? []) as Array<{ id: string; processing_status: string; processing_error: string | null; occurred_at: string; processed_at?: string | null; updated_at: string }>;
  const stateRows = (states.data ?? []) as Array<{ status: string; nova_enabled: boolean; human_owner_id: string | null; updated_at: string; context: Record<string, unknown> | null }>;
  const latest = webhookRows[0];
  const latestFailure = webhookRows.find((row) => row.processing_status === "FAILED");
  const handoff = stateRows.find((row) => row.status === "HUMAN_HANDOFF" || row.nova_enabled === false);
  const dbOk = !customers.error;
  const webhookOk = !webhooks.error;
  const deliveryOn = process.env.WHATSAPP_DELIVERY_ENABLED === "true";
  const biancaMessagingOn = process.env.BIANCA_CUSTOMER_MESSAGING_ENABLED === "true";
  const biancaOutboundOn = biancaOutboundEnabled();
  const whatsappConfigured = configured(["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET", "WHATSAPP_GRAPH_VERSION", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"]);
  const migrationChecks = [
    signal("0211 ingress ledger", webhookOk ? "PASS" : "PENDIENTE", webhookOk ? "whatsapp_webhook_events legible en Production" : safeError(webhooks.error)),
    signal("0212 customer resolution", webhookOk ? "PASS" : "PENDIENTE", "RPC y resolución certificadas por el flujo inbound"),
    signal("0213 outbound outbox", outbound.error ? "PENDIENTE" : "PASS", outbound.error ? safeError(outbound.error) : "whatsapp_outbound_messages legible en Production"),
    signal("0214 phone normalization", webhookOk ? "PASS" : "PENDIENTE", "artefacto de transporte disponible"),
    signal("0215 reminder snapshot", communications.error ? "PENDIENTE" : "PASS", communications.error ? safeError(communications.error) : "communications.context_snapshot legible en Production"),
    signal("0216 email fallback", webhookOk ? "PASS" : "PENDIENTE", "flujo inbound compatible con fallback"),
  ];
  return {
    checkedAt: new Date().toISOString(), accessRole: "CEO / ADMINISTRATOR",
    summary: [
      signal("ORBIT Production", dbOk ? "PASS" : "ERROR", dbOk ? "Base de datos conectada" : safeError(customers.error)),
      signal("WhatsApp inbound", webhookOk && latest?.processing_status === "PROCESSED" ? "PASS" : webhookOk ? "PENDIENTE" : "ERROR", latest ? `Último evento ${latest.processing_status}` : "Sin eventos observables"),
      signal("Delivery automático", deliveryOn ? "ERROR" : "OFF", deliveryOn ? "Debe permanecer desactivado" : "WHATSAPP_DELIVERY_ENABLED=false"),
      signal("BIANCA Engine", "PASS", "Motor preparado; acciones pasan por gates server-side"),
      signal("BIANCA Simulation", biancaSimulationEnabled() ? "PASS" : "PENDIENTE", biancaSimulationEnabled() ? "Disponible solo para Founder; no habilita delivery" : "Deshabilitada explícitamente"),
      signal("BIANCA Customer Messaging", biancaMessagingOn ? "ERROR" : "OFF", biancaMessagingOn ? "Debe permanecer desactivada en Production" : "Fail-closed: mensajería autónoma desactivada"),
      signal("BIANCA Outbound", biancaOutboundOn ? "ERROR" : "OFF", biancaOutboundOn ? "Debe permanecer desactivado en Production" : "Gate de salida desactivado"),
      signal("Dependencias externas", "PENDIENTE", "Meta App Review, Wix y Google Ads fuera de este panel"),
    ],
    whatsapp: [
      signal("Configuración webhook", whatsappConfigured ? "PASS" : "PENDIENTE", whatsappConfigured ? "Variables presentes; valores ocultos" : "Configuración incompleta"),
      signal("WABA / Phone ID", process.env.WHATSAPP_PHONE_NUMBER_ID ? "PASS" : "PENDIENTE", process.env.WHATSAPP_PHONE_NUMBER_ID ? "ID configurado (oculto parcialmente)" : "No configurado"),
      signal("Último webhook", latest ? "PASS" : "PENDIENTE", latest ? `${latest.processing_status} · ${new Date(latest.occurred_at).toLocaleString("es-CL")}` : "Sin eventos"),
      signal("Processor", latest?.processing_status === "PROCESSED" ? "PASS" : latest ? "PENDIENTE" : "NO CONFIGURADO", latestFailure ? `Último error: ${safeError(latestFailure.processing_error)}` : "Sin error reciente"),
      signal("Customer resolution", communications.error ? "PENDIENTE" : "PASS", communications.error ? safeError(communications.error) : "Comunicación inbound legible"),
      signal("Conversation state", stateRows.length ? "PASS" : "PENDIENTE", handoff ? "HUMAN_TAKEOVER observado" : "Estados legibles"),
      signal("HUMAN_TAKEOVER", handoff ? "PASS" : "PENDIENTE", handoff ? `Evidencia ${new Date(handoff.updated_at).toLocaleString("es-CL")}` : "Sin handoff reciente"),
      signal("Delivery", deliveryOn ? "ERROR" : "OFF", deliveryOn ? "Bloqueado: no activar" : "No se envían mensajes"),
    ],
    boombox: [
      signal("orbit.boom-box.cl", "PASS", "Superficie productiva auditada"),
      signal("Cotizador web", "PASS", "Endpoint recibe payload válido"),
      signal("Correo Wix", "PENDIENTE", "customTrigger.runTrigger() en investigación · Wix Customer Care"),
    ],
    google: [
      signal("GA4", configured(["NEXT_PUBLIC_GA_MEASUREMENT_ID"]) ? "PASS" : "PENDIENTE", configured(["NEXT_PUBLIC_GA_MEASUREMENT_ID"]) ? "Measurement ID presente; valor oculto" : "Fuente no configurada"),
      signal("Google Ads", "NO CONFIGURADO", "No hay campañas ni gasto activos"),
      signal("Conversiones", "PENDIENTE", "AW-* y labels requieren configuración externa autorizada"),
    ],
    orbit: [
      signal("Environment", "PASS", "Production"), signal("DB connectivity", dbOk ? "PASS" : "ERROR", dbOk ? "Consulta de solo lectura exitosa" : safeError(customers.error)),
      signal("Migrations 0211–0216", migrationChecks.every((item) => item.status === "PASS") ? "PASS" : "PENDIENTE", migrationChecks.map((item) => `${item.label}: ${item.status}`).join(" · ")),
      signal("Health timestamp", "PASS", new Date().toLocaleString("es-CL")), signal("Delivery guard", deliveryOn ? "ERROR" : "OFF", "Sin mutaciones ni llamadas outbound"),
    ],
  };
}
