import "server-only";
import { createHash, createHmac } from "node:crypto";
import JSZip from "jszip";
import type { GoogleGmailProviderMessage } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { GET as exportTributaryPackage } from "@/app/api/finance/tributary/export/route";
import { createAdminClient } from "@/lib/supabase/admin";

export const accountantPeriodPattern = /^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/;

export async function loadAccountantDeliveryState(period: string) {
  const admin = createAdminClient();
  const [settings, delivery, periodEvent] = await Promise.all([
    admin.from("accountant_delivery_settings").select("recipient").eq("singleton", true).maybeSingle(),
    admin.from("accountant_package_deliveries").select("recipient,status,approved_at,sent_at").eq("period", `${period}-01`).maybeSingle(),
    admin.from("sii_rcv_period_events").select("action").eq("company_rut", "765652723")
      .eq("period", `${period}-01`).in("action", ["CLOSED", "REOPENED"]).order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (settings.error || delivery.error || periodEvent.error) throw new Error("No se pudo verificar el estado del paquete contador.");
  return { recipient: settings.data?.recipient as string | undefined, delivery: delivery.data,
    closed: periodEvent.data?.action === "CLOSED" };
}

export async function buildAccountantDelivery(period: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bbox.cl";
  const url = new URL("/api/finance/tributary/export", origin);
  url.search = new URLSearchParams({ year: period.slice(0, 4), month: period.slice(5), format: "zip" }).toString();
  const response = await exportTributaryPackage(new Request(url));
  if (!response.ok) throw new Error("El paquete contador no pudo generarse completo.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const members = Object.values(zip.files).filter(file => !file.dir)
    .sort((a, b) => a.name.localeCompare(b.name));
  const signature = createHash("sha256");
  const attachments: NonNullable<GoogleGmailProviderMessage["attachments"]>[number][] = [{ filename: `orbit-contador-${period}.zip`, mimeType: "application/zip", content: bytes }];
  for (const member of members) {
    const content = await member.async("uint8array");
    // Excel ZIP timestamps can change between preview and send. The equivalent CSVs
    // are checked individually and determine the workbook contents.
    if (!member.name.endsWith(".xlsx")) {
      signature.update(JSON.stringify([member.name, createHash("sha256").update(content).digest("hex")]));
    }
    if (member.name.endsWith(".xlsx")) {
      attachments.push({ filename: `registro-interno-${period}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", content });
    } else if (member.name.startsWith("RCV-originales/") && member.name.endsWith(".csv")) {
      const filename = member.name.split("/").at(-1)!;
      const checksum = createHash("sha256").update(content).digest("hex");
      attachments.push({ filename: `${checksum.slice(0, 12)}-${filename}`, mimeType: "text/csv", content });
    }
  }
  const summary = (await zip.file("LEEME.txt")?.async("string")) ?? "";
  return { checksum: signature.digest("hex"), attachments, summary };
}

export function accountantPreviewProof(actor: string, period: string, recipient: string, checksum: string) {
  const key = process.env.CRON_SECRET;
  if (!key) throw new Error("La aprobación de envío contable no está habilitada.");
  return createHmac("sha256", key).update(JSON.stringify(["accountant-delivery", actor, period, recipient, checksum])).digest("hex");
}
