import { NextResponse } from "next/server";
import { getConnectorAdministrator } from "@/features/connectors/connector-administrator.guard";
import { checkMercadoPagoApiHealth } from "@/features/payments/mercadopago/mercadopago.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const administrator = await getConnectorAdministrator();
  if (!administrator) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  try {
    const result = await checkMercadoPagoApiHealth();
    return NextResponse.json({ MP_API: result.reachable ? "HEALTHY" : "UNHEALTHY", MP_MODE: result.mode, WEBHOOK_SECRET: result.webhookSecretConfigured ? "CONFIGURED" : "MISSING", HTTP_STATUS: result.status }, { status: result.reachable && result.webhookSecretConfigured ? 200 : 503, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ MP_API: "UNAVAILABLE", MP_MODE: "UNKNOWN", WEBHOOK_SECRET: "UNKNOWN" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
