import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmailRecipients } from "@/lib/email/recipients";
import { loadCompanySettings } from "@/features/company-settings";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import type { GoogleGmailLiveProvider } from "../provider/google-gmail-live.provider";
import { GoogleGmailApiProvider } from "../provider/google-gmail-live.provider";
import {
  TAX_DOCUMENT_DELIVERY_RENDERER_VERSION,
  TAX_DOCUMENT_DELIVERY_TYPE,
  buildTaxDocumentDeliveryText,
  defaultTaxDocumentDeliverySubject,
  renderTaxDocumentDeliveryHtml,
  taxDocumentDeliveryFingerprint,
  type TaxDocumentDeliveryModel,
} from "./tax-document-delivery.template";

type DeliveryHistoryRow = {
  id: string;
  status: string;
  to_recipient: string | null;
  cc_recipients: string[] | null;
  sent_at: string | null;
  occurred_at: string;
  external_message_id: string | null;
  failure_reason: string | null;
  original_communication_id: string | null;
  context_snapshot: Record<string, unknown> | null;
};

export type TaxDocumentDeliveryComposer = {
  projectId: string;
  documentId: string;
  customerId: string;
  customerName: string;
  to: string;
  cc: string[];
  subject: string;
  fingerprint: string;
  model: TaxDocumentDeliveryModel;
  status: "NEVER_SENT" | "SENT" | "FAILED" | "PENDING";
  hasSuccessfulSend: boolean;
  lastAttemptAt: string | null;
  history: {
    id: string;
    status: string;
    to: string;
    cc: string[];
    sentAt: string;
    providerMessageId: string | null;
    failureReason: string | null;
    isResend: boolean;
  }[];
};

const first = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

const status = (history: DeliveryHistoryRow[]): TaxDocumentDeliveryComposer["status"] => {
  if (!history.length) return "NEVER_SENT";
  if (history[0].status === "SENT") return "SENT";
  if (["QUEUED", "PENDING"].includes(history[0].status)) return "PENDING";
  return "FAILED";
};

export async function loadTaxDocumentDeliveryComposer(
  projectId: string,
  documentId: string,
): Promise<TaxDocumentDeliveryComposer> {
  const admin = createAdminClient();
  const [documentResult, historyResult, company] = await Promise.all([
    admin
      .from("documents")
      .select(
        "id,project_id,customer_id,external_tax_document_type,external_folio,external_issue_date,external_total_amount,external_document_status,drive_file_id,storage_bucket,storage_path,original_filename,mime_type,projects!inner(id,name,orbit_event_id,event_date,deleted_at,customers!inner(id,full_name,email,secondary_email))",
      )
      .eq("id", documentId)
      .eq("project_id", projectId)
      .eq("document_type", "EXTERNAL_TAX_DOCUMENT")
      .is("deleted_at", null)
      .single(),
    admin
      .from("communications")
      .select(
        "id,status,to_recipient,cc_recipients,sent_at,occurred_at,external_message_id,failure_reason,original_communication_id,context_snapshot",
      )
      .eq("project_id", projectId)
      .eq("communication_type", TAX_DOCUMENT_DELIVERY_TYPE)
      .order("occurred_at", { ascending: false }),
    loadCompanySettings(admin),
  ]);
  if (documentResult.error) throw documentResult.error;
  if (historyResult.error) throw historyResult.error;

  const document = documentResult.data;
  const project = first(document.projects);
  if (!project || project.deleted_at) throw new Error("El Evento no está disponible.");
  const customer = first(project.customers);
  if (!customer) throw new Error("El Evento no tiene un Cliente canónico asociado.");
  if (
    !document.external_tax_document_type ||
    !document.external_folio ||
    !document.external_issue_date ||
    document.external_total_amount == null
  ) {
    throw new Error("El documento tributario no tiene todos los datos canónicos requeridos.");
  }
  if (!document.drive_file_id && (!document.storage_bucket || !document.storage_path)) {
    throw new Error("El documento tributario no tiene un archivo disponible para adjuntar.");
  }

  const model: TaxDocumentDeliveryModel = {
    customerName: customer.full_name || "Cliente",
    eventName: project.name || project.orbit_event_id,
    eventDate: project.event_date,
    taxType: document.external_tax_document_type,
    folio: document.external_folio,
    issueDate: document.external_issue_date,
    total: Number(document.external_total_amount),
    website: company.website,
  };
  if (!Number.isFinite(model.total) || model.total < 0) {
    throw new Error("El total del documento tributario no es válido.");
  }

  const history = ((historyResult.data ?? []) as DeliveryHistoryRow[]).filter(
    (item) => String(item.context_snapshot?.documentId ?? "") === documentId,
  );

  return {
    projectId,
    documentId,
    customerId: document.customer_id ?? customer.id,
    customerName: model.customerName,
    to: customer.email ?? "",
    cc: customer.secondary_email ? [customer.secondary_email] : [],
    subject: defaultTaxDocumentDeliverySubject(model),
    fingerprint: taxDocumentDeliveryFingerprint(model),
    model,
    status: status(history),
    hasSuccessfulSend: history.some((item) => item.status === "SENT"),
    lastAttemptAt: history[0]?.sent_at ?? history[0]?.occurred_at ?? null,
    history: history.map((item) => ({
      id: item.id,
      status: item.status,
      to: item.to_recipient ?? customer.email ?? "",
      cc: item.cc_recipients ?? [],
      sentAt: item.sent_at ?? item.occurred_at,
      providerMessageId: item.external_message_id,
      failureReason: item.failure_reason,
      isResend: Boolean(item.original_communication_id),
    })),
  };
}

export type SendTaxDocumentDeliveryInput = {
  projectId: string;
  documentId: string;
  actorId: string;
  requestId: string;
  expectedFingerprint: string;
  to: string;
  cc?: string | readonly string[] | null;
  subject?: string | null;
  confirmResend?: boolean;
  sender?: GoogleGmailLiveProvider;
};

export async function sendTaxDocumentDelivery(input: SendTaxDocumentDeliveryInput) {
  const composer = await loadTaxDocumentDeliveryComposer(input.projectId, input.documentId);
  if (composer.fingerprint !== input.expectedFingerprint) {
    throw new Error(
      "El documento o los datos del Evento cambiaron. Vuelve a abrir el envío para revisar la información vigente.",
    );
  }
  const recipients = normalizeEmailRecipients({ to: input.to, cc: input.cc });
  const subject = String(input.subject ?? composer.subject).trim();
  if (!subject || /[\r\n]/.test(subject) || subject.length > 180) {
    throw new Error("El asunto del correo no es válido.");
  }
  if (composer.hasSuccessfulSend && !input.confirmResend) {
    throw new Error(`¿Enviar nuevamente este documento tributario a ${recipients.to}?`);
  }

  const attemptId = input.requestId.trim();
  if (!attemptId) throw new Error("El envío requiere un identificador de intento.");
  const key = `tax-document-delivery:${input.documentId}:${attemptId}`;
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("communications")
    .select("id,status,to_recipient,cc_recipients,sent_at,occurred_at,external_message_id")
    .eq("project_id", input.projectId)
    .eq("communication_type", TAX_DOCUMENT_DELIVERY_TYPE)
    .eq("request_key", key)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return {
      status: existing.status,
      recipient: existing.to_recipient ?? recipients.to,
      ccRecipients: existing.cc_recipients ?? recipients.cc,
      sentAt: existing.sent_at ?? existing.occurred_at,
      communicationId: existing.id,
      providerMessageId: existing.external_message_id,
      deduplicated: true,
    };
  }

  const { data: document, error: documentError } = await admin
    .from("documents")
    .select("drive_file_id,storage_bucket,storage_path,original_filename,mime_type")
    .eq("id", input.documentId)
    .eq("project_id", input.projectId)
    .is("deleted_at", null)
    .single();
  if (documentError) throw documentError;

  const firstSuccessful = composer.history.filter((item) => item.status === "SENT").at(-1);
  const queuedAt = new Date().toISOString();
  const { data: communication, error: insertError } = await admin
    .from("communications")
    .insert({
      customer_id: composer.customerId,
      project_id: input.projectId,
      channel: "GMAIL",
      direction: "OUTBOUND",
      communication_type: TAX_DOCUMENT_DELIVERY_TYPE,
      thread_key: key,
      request_key: key,
      subject,
      body: buildTaxDocumentDeliveryText(composer.model),
      status: "QUEUED",
      to_recipient: recipients.to,
      cc_recipients: recipients.cc,
      occurred_at: queuedAt,
      created_by: input.actorId,
      sent_by: input.actorId,
      original_communication_id: firstSuccessful?.id ?? null,
      context_snapshot: {
        rendererVersion: TAX_DOCUMENT_DELIVERY_RENDERER_VERSION,
        documentId: input.documentId,
        taxType: composer.model.taxType,
        folio: composer.model.folio,
        issueDate: composer.model.issueDate,
        total: composer.model.total,
      },
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      const duplicate = await admin
        .from("communications")
        .select("id,status,to_recipient,cc_recipients,sent_at,occurred_at,external_message_id")
        .eq("project_id", input.projectId)
        .eq("communication_type", TAX_DOCUMENT_DELIVERY_TYPE)
        .eq("request_key", key)
        .single();
      if (duplicate.error) throw duplicate.error;
      return {
        status: duplicate.data.status,
        recipient: duplicate.data.to_recipient ?? recipients.to,
        ccRecipients: duplicate.data.cc_recipients ?? recipients.cc,
        sentAt: duplicate.data.sent_at ?? duplicate.data.occurred_at,
        communicationId: duplicate.data.id,
        providerMessageId: duplicate.data.external_message_id,
        deduplicated: true,
      };
    }
    throw insertError;
  }

  try {
    const sender =
      input.sender ??
      new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken());
    const driveFileIds = document.drive_file_id ? [document.drive_file_id] : [];
    let attachments:
      | { filename: string; mimeType: string; content: Uint8Array }[]
      | undefined;
    if (!driveFileIds.length) {
      const bucket = document.storage_bucket || "orbit-documents";
      const path = document.storage_path;
      if (!path) throw new Error("El archivo del documento tributario no está disponible.");
      const downloaded = await admin.storage.from(bucket).download(path);
      if (downloaded.error || !downloaded.data) {
        throw downloaded.error ?? new Error("No fue posible cargar el archivo tributario.");
      }
      attachments = [
        {
          filename:
            document.original_filename ||
            `${composer.model.taxType}-${composer.model.folio}.pdf`,
          mimeType: document.mime_type || "application/pdf",
          content: new Uint8Array(await downloaded.data.arrayBuffer()),
        },
      ];
    }

    const delivered = await sender.send({
      to: recipients.to,
      cc: recipients.cc,
      idempotencyKey: key,
      subject,
      textBody: buildTaxDocumentDeliveryText(composer.model),
      htmlBody: renderTaxDocumentDeliveryHtml(composer.model),
      driveFileIds,
      attachments,
    });
    const sentAt = new Date().toISOString();
    const update = await admin
      .from("communications")
      .update({
        status: "SENT",
        external_message_id: delivered.messageId,
        thread_key: delivered.threadId,
        sent_at: sentAt,
        occurred_at: sentAt,
        failure_reason: null,
      })
      .eq("id", communication.id);
    if (update.error) throw update.error;

    const timeline = await admin.from("timeline_events").upsert(
      {
        customer_id: composer.customerId,
        project_id: input.projectId,
        communication_id: communication.id,
        event_type: "TAX_DOCUMENT_SENT",
        title: "DOCUMENTO TRIBUTARIO ENVIADO",
        description: `${composer.model.taxType} N° ${composer.model.folio} · Enviado a ${recipients.to}`,
        actor_id: input.actorId,
        actor_label: "Founder",
        source: "Gmail",
        action: "TAX_DOCUMENT_SENT",
        entity_type: "Document",
        entity_id: input.documentId,
        human_message: `Documento tributario ${composer.model.taxType} N° ${composer.model.folio} enviado a ${recipients.to}.`,
        correlation_id: `tax-document-delivery:${communication.id}`,
        created_by: input.actorId,
      },
      { onConflict: "correlation_id", ignoreDuplicates: true },
    );
    if (timeline.error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "tax_document_delivery.timeline_failed",
          projectId: input.projectId,
          documentId: input.documentId,
          error: timeline.error.message,
        }),
      );
    }

    return {
      status: "SENT",
      recipient: recipients.to,
      ccRecipients: recipients.cc,
      sentAt,
      communicationId: communication.id,
      providerMessageId: delivered.messageId,
      deduplicated: false,
    };
  } catch (error) {
    const failureReason =
      error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000);
    await admin
      .from("communications")
      .update({
        status: "FAILED",
        failure_reason: failureReason,
        occurred_at: new Date().toISOString(),
      })
      .eq("id", communication.id);
    throw error;
  }
}
