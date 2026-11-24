"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { loadCompanySettings } from "@/features/company-settings/repository";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleGmailApiProvider, InMemoryGoogleGmailLiveProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { resolveCollectionBankDetails } from "./collection-bank-details";
import { loadAccountsReceivable } from "./repository";
import { buildConsolidatedCollectionHtml, buildConsolidatedCollectionText } from "./consolidated-collection.template";
import { consolidatedCollectionFingerprint, groupReceivablesByCustomer } from "./consolidated-collection";

type Result = { ok: true; communicationId: string; recipient: string; sentAt: string; deduplicated?: boolean; warning?: string } | { ok: false; error: string };
type TestSendResult = { ok: true; recipient: string; sentAt: string } | { ok: false; error: string };
export type PreviewResult = { ok: true; recipient: string; subject: string; html: string; totalOutstanding: number } | { ok: false; error: string };

const CONSOLIDATED_COLLECTION_QA_RECIPIENT = "matias.maira.larrain@gmail.com";
const fail = (error: unknown): Result => ({ ok: false, error: error instanceof Error ? error.message : "No fue posible enviar la cobranza consolidada." });
const failTestSend = (error: unknown): TestSendResult => ({ ok: false, error: error instanceof Error ? error.message : "No fue posible enviar el correo de prueba." });
const failPreview = (error: unknown): PreviewResult => ({ ok: false, error: error instanceof Error ? error.message : "No fue posible generar la vista previa." });

export async function previewConsolidatedCollectionAction(formData: FormData): Promise<PreviewResult> {
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError) throw profileError;
    if (!isAdministrativeRole(profile?.role)) throw new Error("Solo Founder o Administración puede revisar cobranzas.");
    const customerId = String(formData.get("customerId") ?? "").trim();
    const selectedIds = [...new Set(formData.getAll("invoiceIds").map(String).map((id) => id.trim()).filter(Boolean))];
    if (!customerId || !selectedIds.length) throw new Error("Selecciona al menos un evento.");
    const dataset = await loadAccountsReceivable(client, { refreshNotifications: false });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    const group = groupReceivablesByCustomer(dataset.invoices, today).find((item) => item.customerId === customerId);
    if (!group) throw new Error("El cliente ya no tiene saldos activos.");
    const selectedLines = group.lines.filter((line) => selectedIds.includes(line.invoice.id));
    if (selectedLines.length !== selectedIds.length) throw new Error("Uno de los eventos seleccionados cambió o ya no tiene saldo.");
    if (group.reviewRequired) throw new Error("La identidad del cliente requiere revisión: RUT contradictorio o destinatario no verificado.");
    if (!group.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(group.customerEmail.trim())) throw new Error("El cliente no tiene un destinatario verificado.");
    const oldestOverdue = selectedLines.find((line) => line.overdue);
    const selected = { ...group, lines: selectedLines, overdueTotal: selectedLines.filter((line) => line.overdue).reduce((sum, line) => sum + line.invoice.outstandingBalance, 0), upcomingTotal: selectedLines.filter((line) => !line.overdue).reduce((sum, line) => sum + line.invoice.outstandingBalance, 0), totalOutstanding: selectedLines.reduce((sum, line) => sum + line.invoice.outstandingBalance, 0), oldestDueDate: oldestOverdue?.invoice.dueDate ?? null, oldestOverdueDays: oldestOverdue?.overdueDays ?? 0, oldestTermDays: oldestOverdue?.invoice.canonicalPaymentTermDays ?? null };
    const fingerprint = consolidatedCollectionFingerprint(selected, selectedIds);
    if (String(formData.get("expectedFingerprint") ?? "") !== fingerprint) throw new Error("Los saldos cambiaron. Recarga la cobranza consolidada antes de continuar.");
    const projectIds = selectedLines.map((line) => line.invoice.projectId);
    const { data: existingCollections, error: existingError } = await client.from("communications").select("project_id,status").in("project_id", projectIds).eq("communication_type", "COLLECTION_EMAIL_CONSOLIDATED").eq("status", "PENDING");
    if (existingError) throw existingError;
    if ((existingCollections ?? []).length) throw new Error("Uno de los eventos ya tiene una cobranza consolidada en proceso. Revisa el historial antes de intentar nuevamente.");
    const company = await loadCompanySettings(client);
    const bankDetails = resolveCollectionBankDetails(company);
    const body = buildConsolidatedCollectionText({ ...selected, bankDetails });
    const subject = selected.overdueTotal > 0 ? "Cobranza consolidada · saldo vencido pendiente — BOOMBOX" : "Cobranza consolidada · saldo pendiente — BOOMBOX";
    return { ok: true, recipient: group.customerEmail, subject, html: buildConsolidatedCollectionHtml({ ...selected, bankDetails }, subject), totalOutstanding: selected.totalOutstanding };
  } catch (error) { return failPreview(error); }
}

/** Sends the exact consolidated email to the fixed QA address without creating collection or timeline records. */
export async function sendConsolidatedCollectionTestAction(formData: FormData): Promise<TestSendResult> {
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError) throw profileError;
    if (!isAdministrativeRole(profile?.role)) throw new Error("Solo Founder o Administración puede enviar una prueba de cobranza.");

    const customerId = String(formData.get("customerId") ?? "").trim();
    const selectedIds = [...new Set(formData.getAll("invoiceIds").map(String).map((id) => id.trim()).filter(Boolean))];
    if (!customerId || !selectedIds.length) throw new Error("Selecciona al menos un evento para probar.");

    const dataset = await loadAccountsReceivable(client, { refreshNotifications: false });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    const group = groupReceivablesByCustomer(dataset.invoices, today).find((item) => item.customerId === customerId);
    if (!group) throw new Error("El cliente ya no tiene saldos activos.");
    const selectedLines = group.lines.filter((line) => selectedIds.includes(line.invoice.id));
    if (selectedLines.length !== selectedIds.length) throw new Error("Uno de los eventos seleccionados cambió o ya no tiene saldo.");
    if (group.reviewRequired) throw new Error("La identidad tributaria del cliente requiere revisión antes de preparar la prueba.");

    const oldestOverdue = selectedLines.find((line) => line.overdue);
    const selected = {
      ...group,
      lines: selectedLines,
      overdueTotal: selectedLines.filter((line) => line.overdue).reduce((sum, line) => sum + line.invoice.outstandingBalance, 0),
      upcomingTotal: selectedLines.filter((line) => !line.overdue).reduce((sum, line) => sum + line.invoice.outstandingBalance, 0),
      totalOutstanding: selectedLines.reduce((sum, line) => sum + line.invoice.outstandingBalance, 0),
      oldestDueDate: oldestOverdue?.invoice.dueDate ?? null,
      oldestOverdueDays: oldestOverdue?.overdueDays ?? 0,
      oldestTermDays: oldestOverdue?.invoice.canonicalPaymentTermDays ?? null,
    };
    const fingerprint = consolidatedCollectionFingerprint(selected, selectedIds);
    if (String(formData.get("expectedFingerprint") ?? "") !== fingerprint) throw new Error("Los saldos cambiaron. Recarga la cobranza antes de enviar la prueba.");

    const company = await loadCompanySettings(client);
    const bankDetails = resolveCollectionBankDetails(company);
    const body = buildConsolidatedCollectionText({ ...selected, bankDetails });
    const subject = selected.overdueTotal > 0 ? "Cobranza consolidada · saldo vencido pendiente — BOOMBOX" : "Cobranza consolidada · saldo pendiente — BOOMBOX";
    const workspace = await loadGoogleWorkspaceConnection();
    const senderEmail = workspace.workspaceAccount?.trim();
    if (!senderEmail) throw new Error("No se pudo identificar la cuenta remitente oficial de Google Workspace.");

    await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({
      to: CONSOLIDATED_COLLECTION_QA_RECIPIENT,
      cc: [],
      bcc: [],
      from: `"BOOMBOX Cabinas Fotográficas" <${senderEmail}>`,
      subject,
      textBody: body,
      htmlBody: buildConsolidatedCollectionHtml({ ...selected, bankDetails }, subject),
      driveFileIds: [],
      attachments: [],
    });

    return { ok: true, recipient: CONSOLIDATED_COLLECTION_QA_RECIPIENT, sentAt: new Date().toISOString() };
  } catch (error) {
    return failTestSend(error);
  }
}

export async function sendConsolidatedCollectionAction(formData: FormData): Promise<Result> {
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error("Sesión requerida.");
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError) throw profileError;
    if (!isAdministrativeRole(profile?.role)) throw new Error("Solo Founder o Administración puede enviar cobranzas.");

    const customerId = String(formData.get("customerId") ?? "").trim();
    const selectedIds = [...new Set(formData.getAll("invoiceIds").map(String).map((id) => id.trim()).filter(Boolean))];
    const requestId = String(formData.get("requestId") ?? "").trim();
    if (!customerId || !selectedIds.length || !requestId) throw new Error("Selecciona al menos un evento y confirma la revisión.");

    const dataset = await loadAccountsReceivable(client);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    const allGroups = groupReceivablesByCustomer(dataset.invoices, today);
    const group = allGroups.find((item) => item.customerId === customerId);
    if (!group) throw new Error("El cliente ya no tiene saldos activos.");
    const selectedLines = group.lines.filter((line) => selectedIds.includes(line.invoice.id));
    if (selectedLines.length !== selectedIds.length) throw new Error("Uno de los eventos seleccionados cambió o ya no tiene saldo.");
    if (group.reviewRequired) throw new Error("La identidad tributaria del cliente requiere revisión antes de consolidar la cobranza.");
    if (!group.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(group.customerEmail.trim())) throw new Error("El cliente no tiene un destinatario verificado.");
    const oldestOverdue = selectedLines.find((line) => line.overdue);
    const selected = { ...group, lines: selectedLines, overdueTotal: selectedLines.filter((line) => line.overdue).reduce((sum, line) => sum + line.invoice.outstandingBalance, 0), upcomingTotal: selectedLines.filter((line) => !line.overdue).reduce((sum, line) => sum + line.invoice.outstandingBalance, 0), totalOutstanding: selectedLines.reduce((sum, line) => sum + line.invoice.outstandingBalance, 0), oldestDueDate: oldestOverdue?.invoice.dueDate ?? null, oldestOverdueDays: oldestOverdue?.overdueDays ?? 0, oldestTermDays: oldestOverdue?.invoice.canonicalPaymentTermDays ?? null };
    const fingerprint = consolidatedCollectionFingerprint(selected, selectedIds);
    if (String(formData.get("expectedFingerprint") ?? "") !== fingerprint) throw new Error("Los saldos cambiaron. Recarga la cobranza consolidada antes de enviar.");

    const projectIds = selectedLines.map((line) => line.invoice.projectId);
    const { data: existingCollections, error: existingError } = await client
      .from("communications")
      .select("project_id,status")
      .in("project_id", projectIds)
      .eq("communication_type", "COLLECTION_EMAIL_CONSOLIDATED")
      .eq("status", "PENDING");
    if (existingError) throw existingError;
    if ((existingCollections ?? []).length) {
      throw new Error("Uno de los eventos ya tiene una cobranza consolidada en proceso. Revisa el historial antes de intentar nuevamente.");
    }

    const company = await loadCompanySettings(client);
    const bankDetails = resolveCollectionBankDetails(company);
    const body = buildConsolidatedCollectionText({ ...selected, bankDetails });
    const subject = selected.overdueTotal > 0 ? "Cobranza consolidada · saldo vencido pendiente — BOOMBOX" : "Cobranza consolidada · saldo pendiente — BOOMBOX";
    const requestKey = `consolidated-collection:${customerId}:${requestId}`;
    const { data: claims, error: claimError } = await client.rpc("prepare_consolidated_collection", {
      p_customer_id: customerId,
      p_project_ids: projectIds,
      p_request_key: requestKey,
      p_subject: subject,
      p_body: body,
      p_recipient: group.customerEmail,
      p_context_snapshot: { source: "CUSTOMER_COLLECTION", invoiceIds: selectedIds, fingerprint, totalOutstanding: selected.totalOutstanding },
    });
    if (claimError) throw claimError;
    const rows = (claims ?? []) as Array<{ project_id: string; communication_id: string; status: string }>;
    if (rows.length !== selectedLines.length) throw new Error("No fue posible reclamar todos los eventos para un único envío.");
    const currentStatuses = await client.from("communications").select("id,status,occurred_at").in("id", rows.map((row) => row.communication_id));
    if (currentStatuses.error) throw currentStatuses.error;
    const statuses = currentStatuses.data ?? [];
    if (statuses.some((row) => row.status === "SENT")) return { ok: true, communicationId: String(statuses.find((row) => row.status === "SENT")?.id), recipient: group.customerEmail, sentAt: String(statuses.find((row) => row.status === "SENT")?.occurred_at ?? new Date().toISOString()), deduplicated: true };
    if (rows.some((row) => row.status === "PENDING")) throw new Error("Esta cobranza consolidada ya se está procesando. Revisa el historial antes de intentar nuevamente.");

    let sent: { messageId: string | null };
    try {
      const mock = process.env.VERCEL_ENV === "preview" && process.env.CONSOLIDATED_COLLECTION_QA_EMAIL_MOCK === "true";
      if (mock) {
        sent = await new InMemoryGoogleGmailLiveProvider().send({ to: group.customerEmail, cc: group.customerSecondaryEmail ? [group.customerSecondaryEmail] : [], bcc: [], from: '"BOOMBOX QA" <qa@synthetic.invalid>', subject, textBody: body, htmlBody: buildConsolidatedCollectionHtml({ ...selected, bankDetails }, subject), driveFileIds: [], attachments: [] });
      } else {
        const workspace = await loadGoogleWorkspaceConnection();
        const senderEmail = workspace.workspaceAccount?.trim();
        if (!senderEmail) throw new Error("No se pudo identificar la cuenta remitente de Google Workspace.");
        sent = await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({ to: group.customerEmail, cc: group.customerSecondaryEmail ? [group.customerSecondaryEmail] : [], bcc: [], from: `"BOOMBOX Cabinas Fotográficas" <${senderEmail}>`, subject, textBody: body, htmlBody: buildConsolidatedCollectionHtml({ ...selected, bankDetails }, subject), driveFileIds: [], attachments: [] });
      }
    } catch (providerError) {
      await client.from("communications").update({ status: "FAILED", failure_reason: providerError instanceof Error ? providerError.message.slice(0, 500) : "Error de envío" }).in("id", rows.map((row) => row.communication_id));
      throw providerError;
    }
    const sentAt = new Date().toISOString();
    const { error: statusError } = await client.from("communications").update({ status: "SENT", external_message_id: sent.messageId, sent_at: sentAt, sent_by: auth.user.id, occurred_at: sentAt }).in("id", rows.map((row) => row.communication_id));
    if (statusError) return { ok: true, communicationId: rows[0].communication_id, recipient: group.customerEmail, sentAt, warning: "Gmail confirmó el envío, pero el historial requiere revisión." };
    for (const line of selectedLines) {
      await client.from("timeline_events").insert({ customer_id: customerId, project_id: line.invoice.projectId, orbit_event_id: line.invoice.orbitEventId, event_type: "COLLECTION_EMAIL_CONSOLIDATED_SENT", title: "Cobranza consolidada por cliente enviada", description: `Cobranza consolidada enviada por ${line.invoice.outstandingBalance.toLocaleString("es-CL")} CLP de saldo del evento.`, actor_id: auth.user.id, actor_label: "Founder", source: "Accounts Receivable", action: "COLLECTION_EMAIL_CONSOLIDATED_SENT", entity_type: "Communication", entity_id: rows.find((row) => row.project_id === line.invoice.projectId)?.communication_id ?? rows[0].communication_id, human_message: "Cobranza consolidada enviada al cliente.", correlation_id: `${requestKey}:${line.invoice.projectId}`, created_by: auth.user.id });
    }
    for (const path of ["/finance/collections", "/finance/receivables", "/finance"]) revalidatePath(path);
    return { ok: true, communicationId: rows[0].communication_id, recipient: group.customerEmail, sentAt };
  } catch (error) {
    return fail(error);
  }
}
