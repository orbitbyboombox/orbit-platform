import { NextResponse } from "next/server";
import { getConnectorAdministrator } from "@/features/connectors/connector-administrator.guard";
import { loadWhatsAppConnection } from "@/features/connectors/whatsapp-cloud/whatsapp-connection";

export const dynamic = "force-dynamic";

export async function GET() {
  const administrator = await getConnectorAdministrator();
  if (!administrator)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json(await loadWhatsAppConnection(), { headers: { "Cache-Control": "private, no-store" } });
}
