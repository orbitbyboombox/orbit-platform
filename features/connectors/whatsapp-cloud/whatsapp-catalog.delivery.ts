import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { renderBoomboxCommercialEmail } from "@/features/connectors/google-gmail/application/boombox-commercial-email.html";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { loadCompanySettings } from "@/features/company-settings";
import { catalogPublicUrl, type CommercialCatalogCategory, type QuickSendCatalogCategory } from "@/features/commercial-hub/catalogs";
import type { WhatsAppAiDecision } from "./whatsapp-ai.responder";

export type WhatsAppCatalogDeliveryResult =
  | { status: "NOT_REQUESTED" }
  | { status: "MISSING_EMAIL" }
  | { status: "ALREADY_SENT"; email: string; category: CommercialCatalogCategory }
  | { status: "SENT"; email: string; category: CommercialCatalogCategory }
  | { status: "FAILED"; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function deterministicUuid(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20, 32)}`;
}

function confirmedString(decision: WhatsAppAiDecision, field: WhatsAppAiDecision["fields"][number]["field"]) {
  const value = [...decision.fields].reverse().find((item) => item.field === field && item.confidence === "CONFIRMED")?.value;
  return typeof value === "string" ? value.trim() : "";
}

function quickSendCategory(decision: WhatsAppAiDecision): QuickSendCatalogCategory | null {
  if (decision.catalogCategory === "WEDDINGS") return "WEDDINGS";
  if (decision.catalogCategory === "COMPANIES") return "COMPANIES_CATALOG";
  if (decision.catalogCategory !== "EVENTS") return null;
  const eventType = confirmedString(decision, "eventType").toLowerCase();
  return /graduaci|titulaci|egreso/.test(eventType) ? "GRADUATIONS" : "BIRTHDAYS";
}

function replaceVars(value: string, name: string) {
  return value
    .replaceAll("[Nombre]", name)
    .replaceAll("[Nombre Cliente]", name)
    .replaceAll("[Empresa]", name)
    .replaceAll("[Nombre Empresa]", name);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export async function deliverCanonicalCatalogFromWhatsApp(input: {
  decision: WhatsAppAiDecision;
  customerId: string;
  customerName: string;
  customerEmail?: string | null;
  providerMessageId: string;
}): Promise<WhatsAppCatalogDeliveryResult> {
  if (input.decision.requestedAction !== "CATALOG_LOOKUP" || input.decision.catalogCategory === "NONE")
    return { status: "NOT_REQUESTED" };

  const quickCategory = quickSendCategory(input.decision);
  if (!quickCategory) return { status: "FAILED", error: "No se pudo clasificar el catálogo comercial." };
  const category = input.decision.catalogCategory as CommercialCatalogCategory;
  const confirmedEmail = confirmedString(input.decision, "email").toLowerCase();
  const email = EMAIL.test(confirmedEmail) ? confirmedEmail : (input.customerEmail?.trim().toLowerCase() ?? "");
  if (!EMAIL.test(email)) return { status: "MISSING_EMAIL" };

  const client = createAdminClient();
  let claimId: string | null = null;
  try {
    const [{ data: document, error: documentError }, { data: template, error: templateError }, company] = await Promise.all([
      client.from("commercial_documents").select("id,name,version,filename,storage_path,category").eq("category", category).eq("status", "ACTIVE").single(),
      client.from("commercial_email_templates").select("id,subject,body").eq("category", quickCategory).eq("active", true).single(),
      loadCompanySettings(client),
    ]);
    if (documentError || !document) throw new Error("No existe un catálogo ACTIVE para esta categoría.");
    if (templateError || !template) throw new Error("No existe una plantilla comercial ACTIVE para esta categoría.");

    const idempotencyKey = deterministicUuid(`whatsapp-catalog:${input.providerMessageId}:${category}`);
    const { data: existing, error: existingError } = await client.from("commercial_sends").select("id,status,recipient_email").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "SENT") return { status: "ALREADY_SENT", email: existing.recipient_email, category };
    if (existing) throw new Error(`El envío comercial previo quedó en estado ${existing.status}. Requiere revisión.`);

    const name = confirmedString(input.decision, "name") || input.customerName || "";
    const subject = replaceVars(template.subject, name).replaceAll("\n", " ").trim();
    const body = replaceVars(template.body, name).trim();
    const { data: claim, error: claimError } = await client.from("commercial_sends").insert({
      idempotency_key: idempotencyKey,
      recipient_email: email,
      recipient_name: name || null,
      category: quickCategory,
      template_id: template.id,
      document_id: document.id,
      customer_id: input.customerId,
      subject,
      body_snapshot: body,
      document_snapshot: { name: document.name, version: document.version, storagePath: document.storage_path, source: "WHATSAPP_AI" },
      status: "PREPARING",
      sent_by: null,
    }).select("id").single();
    if (claimError || !claim) throw claimError ?? new Error("No se pudo registrar el envío comercial.");
    claimId = claim.id;

    const downloaded = await client.storage.from("orbit-documents").download(document.storage_path);
    if (downloaded.error) throw downloaded.error;
    const pdf = new Uint8Array(await downloaded.data.arrayBuffer());
    const publicUrl = catalogPublicUrl(category, process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl");
    const paragraphs = body.split(/\n{2,}/).map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
    const signatureUrl = typeof company.emailConfiguration.signatureGifUrl === "string" ? company.emailConfiguration.signatureGifUrl : "";
    const signatureHtml = signatureUrl
      ? `<p style="margin:24px 0 0"><img src="${escapeHtml(signatureUrl)}" alt="BOOMBOX" style="display:block;max-width:600px;width:100%;height:auto;border:0"></p>`
      : "<p><strong>Equipo BOOMBOX</strong></p>";
    const htmlBody = renderBoomboxCommercialEmail({
      preheader: "Conoce las experiencias BOOMBOX para tu evento.",
      eyebrow: category === "COMPANIES" ? "EXPERIENCIAS CORPORATIVAS" : "PLANES Y EXPERIENCIAS",
      title: category === "COMPANIES" ? "Experiencias BOOMBOX para tu evento" : "Encuentra la experiencia para tu evento",
      contentHtml: paragraphs,
      website: company.website,
      primaryAction: { href: publicUrl, label: "VER CATÁLOGO" },
      attachmentNote: `${document.filename || `${document.name}.pdf`} está incluido como archivo adjunto.`,
      signatureHtml,
    });
    const sent = await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({
      to: email,
      subject,
      textBody: `${body}\n\nVer catálogo: ${publicUrl}`,
      htmlBody,
      driveFileIds: [],
      attachments: [{ filename: document.filename || `${document.name}.pdf`, mimeType: "application/pdf", content: pdf }],
    });
    const sentAt = new Date().toISOString();
    const { error: finishError } = await client.from("commercial_sends").update({
      status: "SENT",
      external_message_id: sent.messageId,
      sent_at: sentAt,
      document_snapshot: { name: document.name, version: document.version, storagePath: document.storage_path, publicUrl, deliveryMode: "LINK_AND_ATTACHMENT", source: "WHATSAPP_AI" },
    }).eq("id", claim.id);
    if (finishError) throw finishError;

    if (confirmedEmail) {
      const { error: customerError } = await client.from("customers").update({ email, updated_at: sentAt }).eq("id", input.customerId);
      if (customerError) console.error("whatsapp.catalog.customer_email_sync_failed", { customerId: input.customerId, error: customerError.message });
    }
    return { status: "SENT", email, category };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (claimId) await client.from("commercial_sends").update({ status: "FAILED" }).eq("id", claimId);
    console.error("whatsapp.catalog.delivery_failed", { customerId: input.customerId, category: input.decision.catalogCategory, detail });
    return { status: "FAILED", error: detail };
  }
}
