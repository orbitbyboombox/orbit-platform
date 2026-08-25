"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { loadCompanySettings } from "@/features/company-settings/repository";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { resolveCollectionBankDetails } from "./collection-bank-details";
import {
  buildCollectionEmailDraft,
  buildCollectionEmailHtml,
  collectionDraftFingerprint,
} from "./collection-email.template";
import type { ReceivableInvoice } from "./types";
import { normalizeEmailRecipients } from "@/lib/email/recipients";
import { resolveCollectionEventDetail } from "./collection-event-detail";

export type CollectionEmailSendSuccess = {
  ok: true;
  recipient: string;
  ccRecipients: string[];
  sentAt: string;
  communicationId: string;
  providerMessageId: string | null;
  deduplicated?: boolean;
  warning?: string;
};

type Result = CollectionEmailSendSuccess | { ok: false; error: string };

const fail = (error: unknown): { ok: false; error: string } => ({
  ok: false,
  error:
    error instanceof Error
      ? error.message
      : "No fue posible completar la operación.",
});

function normalizeText(value: FormDataEntryValue | null, fallback: string) {
  const text = String(value ?? "").trim();
  return text.length ? text : fallback;
}

async function loadFounderContext() {
  const client = await createSupabaseServerActionClient();
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) throw error ?? new Error("Sesión requerida.");
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role,display_name")
    .eq("id", auth.user.id)
    .single();
  if (profileError) throw profileError;
  if (!isAdministrativeRole(profile?.role)) {
    throw new Error("Solo Founder o Administración puede enviar cobranzas.");
  }
  return { client, userId: auth.user.id, profileRole: profile?.role ?? null };
}

async function loadCollectionTarget(
  client: Awaited<ReturnType<typeof createSupabaseServerActionClient>>,
  invoiceId: string,
) {
  const { data, error } = await client
    .from("accounts_receivable_projection")
    .select(
      "id,invoice_number,customer_id,project_id,orbit_event_id,amount,paid_amount,outstanding_balance,due_date,days_remaining,status,customers(full_name,email,secondary_email,phone),projects(name,event_date,location,city,operations,project_services(service_code,duration_hours),project_operational_contracts(service_start_at,service_end_at))",
    )
    .eq("id", invoiceId)
    .single();
  if (error) throw error;
  const customer = Array.isArray(data.customers)
    ? data.customers[0]
    : data.customers;
  const project = Array.isArray(data.projects)
    ? data.projects[0]
    : data.projects;
  const operational = Array.isArray(project?.project_operational_contracts)
    ? project.project_operational_contracts[0]
    : project?.project_operational_contracts;
  const detail = resolveCollectionEventDetail({
    eventDate: project?.event_date,
    location: project?.location,
    city: project?.city,
    operations: project?.operations,
    services: (project?.project_services ?? []).map((item) => ({
      serviceCode: item.service_code,
      durationHours: Number(item.duration_hours ?? 0) || null,
    })),
    operationalContract: operational
      ? {
          serviceStartAt: operational.service_start_at,
          serviceEndAt: operational.service_end_at,
        }
      : null,
  });
  return { data, customer, project, detail };
}

function buildRequestKey(invoiceId: string, requestId: string) {
  return `collection-email:${invoiceId}:${requestId}`;
}

export async function sendCollectionEmailAction(
  formData: FormData,
): Promise<Result> {
  try {
    const { client, userId } = await loadFounderContext();
    const invoiceId = String(formData.get("invoiceId") ?? "").trim();
    const requestId = String(formData.get("requestId") ?? "").trim();
    if (!invoiceId) throw new Error("La cobranza requiere una cuenta válida.");
    if (!requestId) throw new Error("La cobranza requiere un intento válido.");

    const { data, customer, project, detail } = await loadCollectionTarget(
      client,
      invoiceId,
    );
    const company = await loadCompanySettings(client);
    const bankDetails = resolveCollectionBankDetails(company);
    if (!customer?.email) {
      throw new Error("El cliente no tiene correo registrado.");
    }
    if (["PAID", "CANCELLED", "ARCHIVED"].includes(data.status)) {
      throw new Error("Esta cuenta no tiene un saldo activo para cobrar.");
    }
    if (Number(data.outstanding_balance) <= 0) {
      throw new Error("Esta cuenta no tiene saldo activo para cobrar.");
    }

    const draft = buildCollectionEmailDraft({
      invoiceNumber: data.invoice_number,
      customerName: customer.full_name ?? "Cliente",
      customerEmail: customer.email ?? null,
      customerSecondaryEmail: customer.secondary_email ?? null,
      projectName: project?.name ?? "BOOMBOX",
      amount: Number(data.amount),
      outstandingBalance: Number(data.outstanding_balance),
      dueDate: data.due_date,
      eventDate: detail.eventDate,
      eventLocation: detail.eventLocation,
      service: detail.service,
      eventDuration: detail.eventDuration,
      daysRemaining: data.days_remaining,
      status: data.status as ReceivableInvoice["status"],
      collectionActions: [],
    } as Pick<
      ReceivableInvoice,
      | "invoiceNumber"
      | "customerName"
      | "customerEmail"
      | "customerSecondaryEmail"
      | "projectName"
      | "amount"
      | "outstandingBalance"
      | "dueDate"
      | "eventDate"
      | "eventLocation"
      | "service"
      | "eventDuration"
      | "daysRemaining"
      | "status"
      | "collectionActions"
    >, bankDetails);

    const expectedDraft = String(formData.get("expectedDraft") ?? "");
    if (expectedDraft !== collectionDraftFingerprint(draft)) {
      throw new Error(
        "Los datos del evento o el saldo cambiaron. Cierra y vuelve a abrir la cobranza para revisar la información vigente.",
      );
    }

    const subject = normalizeText(formData.get("subject"), draft.subject);
    const body = normalizeText(formData.get("body"), draft.body);
    const recipients = normalizeEmailRecipients({
      to: customer.email,
      cc: String(formData.get("cc") ?? ""),
    });
    const threadKey = buildRequestKey(invoiceId, requestId);
    const now = new Date().toISOString();
    const { data: existing, error: existingError } = await client
      .from("communications")
      .select("id,status,occurred_at,external_message_id,to_recipient,cc_recipients")
      .eq("project_id", data.project_id)
      .eq("communication_type", "COLLECTION_EMAIL")
      .eq("thread_key", threadKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.id && existing.status === "SENT") {
      return {
        ok: true,
        recipient: existing.to_recipient ?? recipients.to,
        ccRecipients: existing.cc_recipients ?? recipients.cc,
        sentAt: existing.occurred_at ?? now,
        communicationId: existing.id,
        providerMessageId: existing.external_message_id ?? null,
        deduplicated: true,
      };
    }

    if (existing?.id && existing.status === "PENDING") {
      throw new Error(
        "Este envío ya se está procesando. Revisa el historial antes de intentar nuevamente.",
      );
    }

    let communication: { id: string };
    if (existing?.id && existing.status === "FAILED") {
      const { data: retried, error: retryError } = await client
        .from("communications")
        .update({
          subject,
          body,
          status: "PENDING",
          to_recipient: recipients.to,
          cc_recipients: recipients.cc,
          occurred_at: now,
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (retryError) throw retryError;
      communication = retried;
    } else {
      const { data: created, error: communicationError } = await client
        .from("communications")
        .insert({
          customer_id: data.customer_id,
          project_id: data.project_id,
          channel: "GMAIL",
          direction: "OUTBOUND",
          communication_type: "COLLECTION_EMAIL",
          thread_key: threadKey,
          subject,
          body,
          status: "PENDING",
          to_recipient: recipients.to,
          cc_recipients: recipients.cc,
          occurred_at: now,
          created_by: userId,
        })
        .select("id")
        .single();
      if (communicationError) throw communicationError;
      communication = created;
    }

    let sent;
    try {
      sent = await new GoogleGmailApiProvider(
        await loadGoogleWorkspaceAccessToken(),
      ).send({
        to: recipients.to,
        cc: recipients.cc,
        subject,
        textBody: body,
        htmlBody: buildCollectionEmailHtml(draft, body),
        driveFileIds: [],
      });
    } catch (providerError) {
      await client
        .from("communications")
        .update({ status: "FAILED", occurred_at: new Date().toISOString() })
        .eq("id", communication.id);
      throw providerError;
    }

    const sentAt = new Date().toISOString();
    const providerMessageId = sent.messageId;
    const warnings: string[] = [];
    let { error: statusError } = await client
      .from("communications")
      .update({
        status: "SENT",
        external_message_id: providerMessageId,
        occurred_at: sentAt,
      })
      .eq("id", communication.id);
    if (statusError) {
      const retry = await client
        .from("communications")
        .update({
          status: "SENT",
          external_message_id: providerMessageId,
          occurred_at: sentAt,
        })
        .eq("id", communication.id);
      statusError = retry.error;
    }
    if (statusError) {
      warnings.push(
        "El proveedor confirmó el envío, pero el historial requiere revisión.",
      );
    }

    const { error: timelineError } = await client.from("timeline_events").insert({
      customer_id: data.customer_id,
      project_id: data.project_id,
      orbit_event_id: data.orbit_event_id,
      event_type: "COLLECTION_EMAIL_SENT",
      title: "Cobranza por email enviada",
      description: `Founder envió una cobranza por email por ${Number(
        data.outstanding_balance,
      ).toLocaleString("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      })}.`,
      actor_id: userId,
      actor_label: "Founder",
      source: "Accounts Receivable",
      action: "COLLECTION_EMAIL_SENT",
      entity_type: "Communication",
      entity_id: communication.id,
      human_message: "Cobranza por email enviada al cliente.",
      correlation_id: `collection-email:${communication.id}`,
      communication_id: communication.id,
      created_by: userId,
    });
    if (timelineError) {
      warnings.push("El email fue enviado; Timeline quedó pendiente de actualizar.");
    }

    for (const path of [
      "/finance/receivables",
      `/customers/${data.customer_id}`,
      `/projects/${data.project_id}`,
      "/finance",
      "/finance/collections",
    ]) {
      try {
        revalidatePath(path);
      } catch {
        if (!warnings.includes("El email fue enviado; la vista requiere recarga manual."))
          warnings.push("El email fue enviado; la vista requiere recarga manual.");
      }
    }
    return {
      ok: true,
      recipient: recipients.to,
      ccRecipients: recipients.cc,
      sentAt,
      communicationId: communication.id,
      providerMessageId,
      warning: warnings.join(" ") || undefined,
    };
  } catch (error) {
    return fail(error);
  }
}
