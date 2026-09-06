import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmailRecipients, normalizeRequiredEmail } from "@/lib/email/recipients";
import { loadCompanySettings } from "@/features/company-settings";
import { resolveCollectionBankDetails } from "@/features/accounts-receivable/collection-bank-details";
import { requiresPhotoStripDesign } from "@/features/business-core/catalog/service.catalog";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import type { GoogleGmailLiveProvider } from "../provider/google-gmail-live.provider";
import { GoogleGmailApiProvider } from "../provider/google-gmail-live.provider";
import {
  PRE_EVENT_REMINDER_RENDERER_VERSION,
  PRE_EVENT_REMINDER_TYPE,
  buildPreEventReminderText,
  daysUntilPreEvent,
  defaultPreEventReminderSubject,
  formatPreEventDate,
  normalizePreEventSubject,
  preEventReminderFingerprint,
  renderPreEventReminderHtml,
  type PreEventReminderModel,
} from "./pre-event-reminder.template";

export type PreEventReminderStatus = "NEVER_SENT" | "PENDING" | "SENT" | "FAILED";

export type PreEventReminderHistoryItem = {
  id: string;
  status: string;
  to: string;
  cc: string[];
  subject: string;
  sentAt: string;
  providerMessageId: string | null;
  failureReason: string | null;
  isResend: boolean;
};

export type PreEventReminderComposer = {
  projectId: string;
  orbitEventId: string;
  customerId: string;
  customerName: string;
  eventType: string;
  eventDate: string;
  eventDateLabel: string;
  daysUntilEvent: number;
  to: string;
  cc: string[];
  subject: string;
  model: PreEventReminderModel;
  fingerprint: string;
  scrapbookSource: string;
  photoDesignSource: string;
  balanceSource: string;
  dueDateSource: string;
  bankDataSource: string | null;
  paymentReceiptEmailSource: string | null;
  status: PreEventReminderStatus;
  hasSuccessfulSend: boolean;
  lastAttemptAt: string | null;
  history: PreEventReminderHistoryItem[];
};

type CommunicationRow = {
  id: string;
  status: string;
  to_recipient: string | null;
  cc_recipients: string[] | null;
  subject: string | null;
  occurred_at: string;
  sent_at: string | null;
  external_message_id: string | null;
  failure_reason: string | null;
  original_communication_id: string | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extraCode(value: unknown) {
  if (typeof value === "string") return value.trim().toUpperCase();
  const item = object(value);
  return String(item.code ?? item.id ?? item.label ?? "").trim().toUpperCase();
}

function validEventStatus(value: string) {
  return !["ARCHIVED", "CANCELLED", "CANCELED", "DELETED"].includes(
    value.trim().toUpperCase(),
  );
}

function status(history: CommunicationRow[]): PreEventReminderStatus {
  if (!history.length) return "NEVER_SENT";
  if (history[0]?.status === "SENT") return "SENT";
  if (["QUEUED", "PENDING"].includes(history[0]?.status ?? "")) return "PENDING";
  return "FAILED";
}

function assertBankConfiguration(bank: ReturnType<typeof resolveCollectionBankDetails>) {
  const values = [bank.bankName, bank.accountType, bank.accountNumber, bank.rut];
  if (values.some((value) => !value || /no configurad|sin (?:número|rut)/i.test(value))) {
    throw new Error(
      "Los datos bancarios canónicos no están completos en Configuración de empresa.",
    );
  }
  normalizeRequiredEmail(bank.email, "correo para comprobantes");
}

export async function loadPreEventReminderComposer(
  projectId: string,
): Promise<PreEventReminderComposer> {
  const admin = createAdminClient();
  const [projectResult, receivableResult, historyResult, company] = await Promise.all([
    admin
      .from("projects")
      .select(
        "id,customer_id,orbit_event_id,name,project_type,status,event_date,customers!inner(full_name,email,secondary_email),project_services(service_code,extras),project_operational_contracts(staff_arrival_at,assembly_start_at),event_operational_requirements(code,status),documents(document_type,is_current,workflow_status,deleted_at)",
      )
      .eq("id", projectId)
      .is("deleted_at", null)
      .single(),
    admin
      .from("accounts_receivable_projection")
      .select("id,outstanding_balance,due_date,effective_status,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("communications")
      .select(
        "id,status,to_recipient,cc_recipients,subject,occurred_at,sent_at,external_message_id,failure_reason,original_communication_id",
      )
      .eq("project_id", projectId)
      .eq("communication_type", PRE_EVENT_REMINDER_TYPE)
      .order("occurred_at", { ascending: false }),
    loadCompanySettings(admin),
  ]);
  if (projectResult.error) throw projectResult.error;
  if (receivableResult.error) throw receivableResult.error;
  if (historyResult.error) throw historyResult.error;

  const project = projectResult.data;
  if (!validEventStatus(String(project.status ?? ""))) {
    throw new Error("El Evento no está activo para enviar este recordatorio.");
  }
  if (!project.event_date) {
    throw new Error("El Evento no tiene una fecha canónica registrada.");
  }
  const customer = first(project.customers);
  if (!customer) throw new Error("El Evento no tiene un Cliente canónico asociado.");
  const services = project.project_services ?? [];
  const requirements = project.event_operational_requirements ?? [];
  const requirementScrapbook = requirements.some(
    (item) => item.status === "ACTIVE" && item.code.trim().toUpperCase() === "SCRAPBOOK",
  );
  const serviceScrapbook = services.some((service) =>
    (Array.isArray(service.extras) ? service.extras : []).some((extra) =>
      extraCode(extra).includes("SCRAPBOOK"),
    ),
  );
  const scrapbookIncluded = requirementScrapbook || serviceScrapbook;
  const serviceCodes = services.map((service) => service.service_code);
  const photoDesignRequired = requiresPhotoStripDesign(serviceCodes);
  const designApproved = (project.documents ?? []).some(
    (document) =>
      document.document_type === "PHOTO_STRIP_DESIGN" &&
      document.is_current === true &&
      document.workflow_status === "APPROVED" &&
      !document.deleted_at,
  );
  const operational = first(project.project_operational_contracts);
  const receivable = receivableResult.data;
  const receivableInactive = ["PAID", "CANCELLED", "CANCELED", "ARCHIVED"].includes(
    String(receivable?.effective_status ?? "").toUpperCase(),
  );
  const outstandingBalance = receivableInactive
    ? 0
    : Number(receivable?.outstanding_balance ?? 0);
  if (!Number.isFinite(outstandingBalance) || outstandingBalance < 0) {
    throw new Error("El saldo canónico del Evento no es válido.");
  }
  const bankDetails = outstandingBalance > 0 ? resolveCollectionBankDetails(company) : null;
  if (bankDetails) assertBankConfiguration(bankDetails);
  const model: PreEventReminderModel = {
    customerName: customer.full_name || "Cliente",
    eventDate: project.event_date,
    operatorArrivalAt: operational?.staff_arrival_at ?? null,
    assemblyStartAt: operational?.assembly_start_at ?? null,
    scrapbookIncluded,
    photoDesignPending: photoDesignRequired && !designApproved,
    payment:
      outstandingBalance > 0 && receivable && bankDetails
        ? {
            projectionId: receivable.id,
            outstandingBalance,
            dueDate: receivable.due_date,
            bankDetails,
          }
        : null,
    website: company.website,
  };
  // Rendering here is a send gate: an invalid canonical date or model cannot open the composer.
  renderPreEventReminderHtml(model);
  const history = (historyResult.data ?? []) as CommunicationRow[];
  const eventDateLabel = formatPreEventDate(project.event_date);
  return {
    projectId,
    orbitEventId: project.orbit_event_id,
    customerId: project.customer_id,
    customerName: model.customerName,
    eventType: project.project_type,
    eventDate: project.event_date,
    eventDateLabel,
    daysUntilEvent: daysUntilPreEvent(project.event_date),
    to: customer.email ?? "",
    cc: customer.secondary_email ? [customer.secondary_email] : [],
    subject: defaultPreEventReminderSubject(project.event_date),
    model,
    fingerprint: preEventReminderFingerprint(model),
    scrapbookSource: requirementScrapbook
      ? "event_operational_requirements.code"
      : "project_services.extras",
    photoDesignSource: "documents.PHOTO_STRIP_DESIGN.workflow_status",
    balanceSource: "accounts_receivable_projection.outstanding_balance",
    dueDateSource: "accounts_receivable_projection.due_date",
    bankDataSource: bankDetails
      ? "company_settings.pdf_configuration.commercialBank"
      : null,
    paymentReceiptEmailSource: bankDetails
      ? "company_settings.pdf_configuration.commercialBank.email"
      : null,
    status: status(history),
    hasSuccessfulSend: history.some((item) => item.status === "SENT"),
    lastAttemptAt: history[0]?.sent_at ?? history[0]?.occurred_at ?? null,
    history: history.map((item) => ({
      id: item.id,
      status: item.status,
      to: item.to_recipient ?? customer.email ?? "",
      cc: item.cc_recipients ?? [],
      subject: item.subject ?? defaultPreEventReminderSubject(project.event_date),
      sentAt: item.sent_at ?? item.occurred_at,
      providerMessageId: item.external_message_id,
      failureReason: item.failure_reason,
      isResend: Boolean(item.original_communication_id),
    })),
  };
}

export type SendPreEventReminderInput = {
  projectId: string;
  actorId: string;
  requestId: string;
  expectedFingerprint: string;
  to: string;
  cc?: string | readonly string[] | null;
  subject: string;
  confirmResend?: boolean;
  sender?: GoogleGmailLiveProvider;
};

export type SendPreEventReminderResult = {
  status: "SENT" | "FAILED" | "PENDING";
  recipient: string;
  ccRecipients: string[];
  sentAt: string;
  communicationId: string;
  providerMessageId: string | null;
  deduplicated: boolean;
};

const requestKey = (projectId: string, attemptId: string) =>
  `pre-event-reminder:${projectId}:${attemptId}`;

export async function sendPreEventReminder(
  input: SendPreEventReminderInput,
): Promise<SendPreEventReminderResult> {
  const attemptId = input.requestId.trim();
  if (!attemptId) throw new Error("El envío requiere un identificador de intento.");
  const composer = await loadPreEventReminderComposer(input.projectId);
  if (input.expectedFingerprint !== composer.fingerprint) {
    throw new Error(
      "Los datos del Evento cambiaron. Cierra y vuelve a abrir el recordatorio para revisar la información vigente.",
    );
  }
  const recipients = normalizeEmailRecipients({ to: input.to, cc: input.cc });
  const subject = normalizePreEventSubject(input.subject, composer.subject);
  const key = requestKey(input.projectId, attemptId);
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("communications")
    .select(
      "id,status,to_recipient,cc_recipients,sent_at,occurred_at,external_message_id",
    )
    .eq("project_id", input.projectId)
    .eq("communication_type", PRE_EVENT_REMINDER_TYPE)
    .eq("request_key", key)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return {
      status:
        existing.status === "SENT"
          ? "SENT"
          : existing.status === "FAILED"
            ? "FAILED"
            : "PENDING",
      recipient: existing.to_recipient ?? recipients.to,
      ccRecipients: existing.cc_recipients ?? recipients.cc,
      sentAt: existing.sent_at ?? existing.occurred_at,
      communicationId: existing.id,
      providerMessageId: existing.external_message_id,
      deduplicated: true,
    };
  }
  if (composer.hasSuccessfulSend && !input.confirmResend) {
    throw new Error(`¿Enviar nuevamente el recordatorio pre-evento a ${recipients.to}?`);
  }
  const firstSuccessful = composer.history
    .filter((item) => item.status === "SENT")
    .at(-1);
  const body = buildPreEventReminderText(composer.model);
  const htmlBody = renderPreEventReminderHtml(composer.model, subject);
  const queuedAt = new Date().toISOString();
  const contextSnapshot = {
    rendererVersion: PRE_EVENT_REMINDER_RENDERER_VERSION,
    eventDate: composer.eventDate,
    daysUntilEvent: composer.daysUntilEvent,
    operational: {
      operatorArrivalAt: composer.model.operatorArrivalAt,
      assemblyStartAt: composer.model.assemblyStartAt,
    },
    conditionalBlocks: {
      scrapbook: composer.model.scrapbookIncluded,
      photoDesignPending: composer.model.photoDesignPending,
      payment: Boolean(composer.model.payment),
    },
    sources: {
      scrapbook: composer.scrapbookSource,
      photoDesign: composer.photoDesignSource,
      balance: composer.balanceSource,
      dueDate: composer.dueDateSource,
      bankData: composer.bankDataSource,
      paymentReceiptEmail: composer.paymentReceiptEmailSource,
    },
    financial: composer.model.payment
      ? {
          projectionId: composer.model.payment.projectionId,
          outstandingBalance: composer.model.payment.outstandingBalance,
          dueDate: composer.model.payment.dueDate,
        }
      : { projectionId: null, outstandingBalance: 0, dueDate: null },
  };
  const { data: communication, error: insertError } = await admin
    .from("communications")
    .insert({
      customer_id: composer.customerId,
      project_id: input.projectId,
      channel: "GMAIL",
      direction: "OUTBOUND",
      communication_type: PRE_EVENT_REMINDER_TYPE,
      thread_key: key,
      request_key: key,
      subject,
      body,
      status: "QUEUED",
      to_recipient: recipients.to,
      cc_recipients: recipients.cc,
      occurred_at: queuedAt,
      created_by: input.actorId,
      sent_by: input.actorId,
      original_communication_id: firstSuccessful?.id ?? null,
      context_snapshot: contextSnapshot,
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      const duplicate = await admin
        .from("communications")
        .select(
          "id,status,to_recipient,cc_recipients,sent_at,occurred_at,external_message_id",
        )
        .eq("project_id", input.projectId)
        .eq("communication_type", PRE_EVENT_REMINDER_TYPE)
        .eq("request_key", key)
        .single();
      if (duplicate.error) throw duplicate.error;
      return {
        status:
          duplicate.data.status === "SENT"
            ? "SENT"
            : duplicate.data.status === "FAILED"
              ? "FAILED"
              : "PENDING",
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

  let providerAccepted = false;
  try {
    const sender =
      input.sender ??
      new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken());
    const delivered = await sender.send({
      to: recipients.to,
      cc: recipients.cc,
      idempotencyKey: key,
      subject,
      textBody: body,
      htmlBody,
      driveFileIds: [],
    });
    providerAccepted = true;
    const sentAt = new Date().toISOString();
    let updateError: { message: string } | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
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
      updateError = update.error;
      if (!updateError) break;
    }
    if (updateError) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "pre_event_reminder.provider_accepted_history_pending",
          projectId: input.projectId,
          communicationId: communication.id,
          error: updateError.message,
        }),
      );
      return {
        status: "PENDING",
        recipient: recipients.to,
        ccRecipients: recipients.cc,
        sentAt,
        communicationId: communication.id,
        providerMessageId: delivered.messageId,
        deduplicated: false,
      };
    }
    const { error: timelineError } = await admin.from("timeline_events").upsert(
      {
        customer_id: composer.customerId,
        project_id: input.projectId,
        orbit_event_id: composer.orbitEventId,
        communication_id: communication.id,
        event_type: "PRE_EVENT_REMINDER_SENT",
        title: "RECORDATORIO PRE-EVENTO ENVIADO",
        description: `Enviado a: ${recipients.to}`,
        actor_id: input.actorId,
        actor_label: "Founder",
        source: "Gmail",
        action: "PRE_EVENT_REMINDER_SENT",
        entity_type: "Communication",
        entity_id: communication.id,
        human_message: `RECORDATORIO PRE-EVENTO ENVIADO · Enviado a: ${recipients.to}`,
        correlation_id: `pre-event-reminder:${communication.id}`,
        created_by: input.actorId,
      },
      { onConflict: "correlation_id", ignoreDuplicates: true },
    );
    if (timelineError) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "pre_event_reminder.timeline_failed",
          projectId: input.projectId,
          communicationId: communication.id,
          error: timelineError.message,
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
    if (!providerAccepted) {
      const failureReason =
        error instanceof Error
          ? error.message.slice(0, 2_000)
          : String(error).slice(0, 2_000);
      await admin
        .from("communications")
        .update({
          status: "FAILED",
          failure_reason: failureReason,
          occurred_at: new Date().toISOString(),
        })
        .eq("id", communication.id);
    }
    throw error;
  }
}
