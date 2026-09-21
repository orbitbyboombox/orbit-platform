import { NextResponse } from "next/server";
import { recordMercadoPagoHealthSnapshot } from "@/features/payments/mercadopago/mercadopago-health-snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await recordMercadoPagoHealthSnapshot();
    return NextResponse.json({
      ok: result.healthy,
      MP_MODE: result.mode,
      MODE_VALID: result.modeValid,
      ACCESS_TOKEN_PRESENT: result.accessTokenPresent,
      WEBHOOK_SECRET_PRESENT: result.webhookSecretConfigured,
      MP_API_AUTH: result.apiAuth,
      MP_API_REACHABLE: result.reachable,
      HTTP_STATUS: result.status,
      checkedAt: result.checkedAt,
    }, { status: result.healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Health snapshot failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
