"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { normalizeRequiredEmail } from "@/lib/email/recipients";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { renderBoomboxCommercialEmail } from "@/features/connectors/google-gmail/application/boombox-commercial-email.html";
import { loadCompanySettings } from "@/features/company-settings";
import { quoteDisplayFilename } from "@/features/commercial-hub/presentation";
import { loadStoredAcceptedQuote } from "@/features/commercial-hub/original-quote-resend";
import { originalQuotePdfHref } from "@/features/commercial-hub/original-quote-resend-model";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

async function requireAdmin() {
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", data.user.id).single();
  if (!isAdministrativeRole(profile?.role)) throw new Error("Solo Founder o Administración puede reenviar cotizaciones.");
  return { userId: data.user.id };
}

export async function inspectOriginalQuoteResendAction(projectId: string, quoteId: string) {
  try {
    await requireAdmin();
    const stored = await loadStoredAcceptedQuote(projectId, quoteId);
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("commercial_sends")
      .select("id,status,sent_at,recipient_email,subject,external_message_id,document_snapshot")
      .eq("project_id", projectId)
      .eq("quotation_id", quoteId)
      .order("sent_at", { ascending: false });
    if (error) throw error;
    const history = (rows ?? [])
      .filter((row) => {
        const snapshot = row.document_snapshot && typeof row.document_snapshot === "object" ? row.document_snapshot as Record<string, unknown> : {};
        return snapshot.purpose === "FORMAL_QUOTE_RESEND";
      })
      .map((row) => ({ id: row.id, status: row.status, sentAt: row.sent_at, recipient: row.recipient_email, subject: row.subject, messageId: row.external_message_id }));
    return { ok: true as const, available: true, version: stored.version, href: originalQuotePdfHref(quoteId, stored.version), downloadHref: originalQuotePdfHref(quoteId, stored.version, true), history };
  } catch (error) {
    return { ok: false as const, available: false, error: errorMessage(error, "PDF original no disponible. Se requiere revisión administrativa.") };
  }
}

export async function resendOriginalQuoteAction(input: { projectId: string; quoteId: string; recipientEmail: string; requestId: string }) {
  let claimId: string | null = null;
  try {
    const { userId } = await requireAdmin();
    const recipient = normalizeRequiredEmail(input.recipientEmail, "destinatario");
    const stored = await loadStoredAcceptedQuote(input.projectId, input.quoteId);
    const admin = createAdminClient();
    const [{ data: quote }, { data: project }, company] = await Promise.all([
      admin.from("quotations").select("customer_id").eq("id", input.quoteId).single(),
      admin.from("projects").select("name,event_date,customers(full_name,company)").eq("id", input.projectId).single(),
      loadCompanySettings(admin),
    ]);
    if (!quote || !project) throw new Error("Evento o cotización no disponibles.");
    const customer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
    const customerName = String(customer?.company || customer?.full_name || "cliente");
    const subject = `BOOMBOX | Reenvío de cotización — ${project.name}`;
    const body = `Hola, ${customerName}:\n\nTal como nos solicitaste, te enviamos nuevamente la cotización correspondiente a tu evento.\n\nAdjuntamos el documento para que puedas revisarlo cuando lo necesites.\n\nSaludos,\nEquipo BOOMBOX`;
    const pdf = await admin.storage.from("orbit-documents").download(stored.storagePath);
    if (pdf.error) throw new Error("PDF original no disponible. Se requiere revisión administrativa.");
    const bytes = new Uint8Array(await pdf.data.arrayBuffer());
    const filename = quoteDisplayFilename(stored.quotationNumber).replace(/\.pdf$/i, `_V${stored.version}.pdf`);
    const claim = await admin.from("commercial_sends").insert({
      idempotency_key: input.requestId,
      recipient_email: recipient,
      category: "COMPANIES_QUOTE",
      quotation_id: input.quoteId,
      customer_id: quote.customer_id,
      project_id: input.projectId,
      subject,
      body_snapshot: body,
      document_snapshot: { purpose: "FORMAL_QUOTE_RESEND", quote: stored.quotationNumber, version: stored.version, versionId: stored.versionId, pdfPath: stored.storagePath },
      status: "PREPARING",
      sent_by: userId,
    }).select("id").single();
    if (claim.error) {
      if (claim.error.code === "23505") return { ok: true as const, duplicate: true, message: "Este reenvío ya fue procesado o está en curso." };
      throw claim.error;
    }
    claimId = claim.data.id;
    const signatureUrl = typeof company.emailConfiguration.signatureGifUrl === "string" ? company.emailConfiguration.signatureGifUrl : "";
    const htmlBody = renderBoomboxCommercialEmail({ preheader: `Reenvío de cotización ${stored.quotationNumber}.`, eyebrow: "COTIZACIÓN BOOMBOX", title: "Reenvío de cotización", contentHtml: `<p>Hola, ${customerName}:</p><p>Tal como nos solicitaste, te enviamos nuevamente la cotización correspondiente a tu evento.</p><p>Adjuntamos el documento para que puedas revisarlo cuando lo necesites.</p>`, website: company.website, attachmentNote: `${filename} está incluido como archivo adjunto.`, signatureHtml: signatureUrl ? `<p><img src="${signatureUrl}" alt="BOOMBOX" style="display:block;max-width:420px;width:100%;height:auto;border:0"></p>` : "<p>Equipo BOOMBOX</p>" });
    const sent = await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({ to: recipient, cc: [], subject, textBody: body, htmlBody, driveFileIds: [], attachments: [{ filename, mimeType: "application/pdf", content: bytes }] });
    const sentAt = new Date().toISOString();
    const { error: updateError } = await admin.from("commercial_sends").update({ status: "SENT", external_message_id: sent.messageId, sent_at: sentAt }).eq("id", claimId);
    if (updateError) throw updateError;
    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true as const, duplicate: false, message: "Cotización reenviada correctamente." };
  } catch (error) {
    if (claimId) await createAdminClient().from("commercial_sends").update({ status: "FAILED", sent_at: new Date().toISOString() }).eq("id", claimId);
    return { ok: false as const, error: errorMessage(error, "No fue posible reenviar la cotización.") };
  }
}
