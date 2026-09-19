import { NextResponse } from "next/server";
import { getConnectorAdministrator } from "@/features/connectors/connector-administrator.guard";
import { runWhatsAppAiHealthCheck } from "@/features/connectors/whatsapp-cloud/whatsapp-ai.responder";

export const dynamic = "force-dynamic";

export async function GET() {
  const administrator = await getConnectorAdministrator();
  if (!administrator) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  const result = await runWhatsAppAiHealthCheck();
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
