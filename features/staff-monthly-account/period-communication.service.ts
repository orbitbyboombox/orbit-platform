import "server-only";
import { executePeriodDelivery } from "./period-delivery.protocol";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { buildStaffPeriodClosedEmail } from "@/features/staff-communications/staff-email.templates";
import { createStaffMonthlySettlementPdf } from "./settlement-pdf";
import {
  periodDocumentInput,
  type PeriodDocumentPayload,
} from "./period-document.model";
import { periodLabel } from "./payment-periods.model";
import { syncStaffDocumentArchive } from "./drive-archive.service";

const notificationState = (value: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "payload"),
  );

type Metadata = Record<string, unknown> & {
  payload: PeriodDocumentPayload;
  email_status: string;
  period_id: string;
};
export async function getPeriodCloseNotice(periodId: string) {
  const admin = createAdminClient();
  const outbox = await admin
    .from("staff_period_email_outbox")
    .select("notification_id,payload")
    .eq("period_id", periodId)
    .maybeSingle();
  if (outbox.error) throw outbox.error;
  if (!outbox.data) return null;
  const { data, error } = await admin
    .from("internal_notifications")
    .select("id,correlation_id,metadata")
    .eq("id", outbox.data.notification_id)
    .single();
  if (error || !data)
    throw error ?? new Error("Envío de cierre no encontrado.");
  return {
    ...data,
    metadata: {
      ...(data.metadata as Record<string, unknown>),
      payload: outbox.data.payload,
    } as Metadata,
  };
}
export async function renderPeriodCloseDocument(metadata: Metadata) {
  if (metadata.attachment_path) {
    const { data, error } = await createAdminClient()
      .storage.from("orbit-documents")
      .download(String(metadata.attachment_path));
    if (error || !data)
      throw error ?? new Error("PDF protegido no encontrado.");
    const pdf = Buffer.from(await data.arrayBuffer());
    if (
      metadata.attachment_sha256 &&
      createHash("sha256").update(pdf).digest("hex") !==
        metadata.attachment_sha256
    )
      throw new Error(
        "El PDF protegido no coincide con el adjunto del cierre.",
      );
    return pdf;
  }
  return createStaffMonthlySettlementPdf(periodDocumentInput(metadata.payload));
}

/** One compare-and-set claim per close. Unknown outcomes are never retried automatically. */
export async function deliverStaffPeriodCloseEmail(periodId: string) {
  const notice = await getPeriodCloseNotice(periodId);
  if (!notice)
    return {
      sent: false,
      message: "Cierre histórico sin envío automático pendiente.",
    };
  if (notice.metadata.email_status === "SENT")
    return {
      sent: true,
      message: "Gmail ya aceptó este correo; no se duplicó.",
    };
  const admin = createAdminClient();
  const metadata = {
    ...notice.metadata,
    email_status: "PREPARING",
    attempted_at: new Date().toISOString(),
    email_history: [
      ...((notice.metadata.email_history as unknown[]) ?? []),
      { status: "PREPARING", at: new Date().toISOString() },
    ],
  };
  let state: Record<string, unknown> = metadata;
  let documentId: string | undefined;
  const result = await executePeriodDelivery({
    claim: async () => {
      const claimed = await admin
        .from("internal_notifications")
        .update({ metadata: notificationState(metadata) })
        .eq("id", notice.id)
        .eq("metadata->>email_status", "PENDING")
        .select("id");
      if (claimed.error) throw claimed.error;
      return Boolean(claimed.data?.length);
    },
    mark: async (patch) => {
      const next = {
        ...state,
        ...patch,
        email_history: [
          ...((state.email_history as unknown[]) ?? []),
          { status: patch.email_status, at: new Date().toISOString() },
        ],
      };
      const { error } = await admin
        .from("internal_notifications")
        .update({ metadata: notificationState(next) })
        .eq("id", notice.id);
      if (error) throw error;
      state = next;
    },
    prepare: async () => {
      const payload = metadata.payload;
      const input = periodDocumentInput(payload);
      const path = `staff/${payload.staff.id}/04_LIQUIDACIONES/${String(payload.account.accounting_month).slice(0, 7)}/${periodId}.pdf`;
      let { data: file } = await admin.storage
        .from("orbit-documents")
        .download(path);
      if (!file) {
        const pdf = await createStaffMonthlySettlementPdf(input);
        const uploaded = await admin.storage
          .from("orbit-documents")
          .upload(path, pdf, { contentType: "application/pdf", upsert: false });
        if (uploaded.error && String(uploaded.error.statusCode) !== "409")
          throw uploaded.error;
        const read = await admin.storage.from("orbit-documents").download(path);
        if (read.error || !read.data)
          throw read.error ?? new Error("No se pudo verificar el PDF adjunto.");
        file = read.data;
      }
      const pdf = Buffer.from(await file.arrayBuffer());
      const fileName = `Liquidacion-BOOMBOX-${String(payload.account.accounting_month).slice(0, 7)}-${payload.period.period_code}.pdf`;
      const existing = await admin
        .from("staff_onboarding_documents")
        .select("id")
        .eq("staff_id", payload.staff.id)
        .eq("storage_bucket", "orbit-documents")
        .eq("storage_path", path)
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (existing.error) throw existing.error;
      const document =
        existing.data ??
        (
          await admin
            .from("staff_onboarding_documents")
            .insert({
              invitation_id: null,
              staff_id: payload.staff.id,
              document_type: "STAFF_MONTHLY_SETTLEMENT",
              category: "LIQUIDACIONES",
              applicable_month: String(payload.account.accounting_month).slice(
                0,
                7,
              ),
              friendly_label: periodLabel(payload.period.period_code),
              status: "ACTIVE",
              storage_bucket: "orbit-documents",
              storage_path: path,
              file_name: fileName,
              mime_type: "application/pdf",
            })
            .select("id")
            .single()
        ).data;
      if (!document)
        throw new Error("No se pudo archivar el PDF de la liquidación.");
      const email = periodCloseEmailPreview(payload);
      const token = await loadGoogleWorkspaceAccessToken();
      documentId = document.id;
      return {
        evidence: {
          attachment_document_id: document.id,
          attachment_path: path,
          attachment_sha256: createHash("sha256").update(pdf).digest("hex"),
          recipient: payload.staff.email,
        },
        send: () =>
          new GoogleGmailApiProvider(token).send({
            to: payload.staff.email,
            subject: email.subject,
            textBody: email.textBody,
            htmlBody: email.htmlBody,
            driveFileIds: [],
            attachments: [
              {
                filename: fileName,
                mimeType: "application/pdf",
                content: new Uint8Array(pdf),
              },
            ],
            idempotencyKey: notice.correlation_id,
            maxSendAttempts: 1,
          }),
      };
    },
  });
  if (result.sent && documentId) {
    try {
      await syncStaffDocumentArchive(admin, documentId);
    } catch {
      console.error("staff_period_pdf_drive_archive_pending", periodId);
    }
  }
  return result;
}

/** Read-only data shared by PDF and email previews. Caller must authorize account/staff access. */
export async function loadPeriodDocumentPayload(
  periodId: string,
  expectedAccountId?: string,
): Promise<PeriodDocumentPayload> {
  const notice = await getPeriodCloseNotice(periodId);
  if (notice) {
    if (
      expectedAccountId &&
      notice.metadata.payload.account.id !== expectedAccountId
    )
      throw new Error("Período no autorizado.");
    return notice.metadata.payload;
  }
  const admin = createAdminClient();
  const periodResult = await admin
    .from("staff_payment_periods")
    .select("*")
    .eq("id", periodId)
    .single();
  if (periodResult.error || !periodResult.data)
    throw periodResult.error ?? new Error("Período no encontrado.");
  const period = periodResult.data;
  if (expectedAccountId && period.account_id !== expectedAccountId)
    throw new Error("Período no autorizado.");
  const accountResult = await admin
    .from("staff_monthly_accounts")
    .select("*")
    .eq("id", period.account_id)
    .single();
  if (accountResult.error || !accountResult.data)
    throw accountResult.error ?? new Error("Cuenta no encontrada.");
  const account = accountResult.data;
  const [staff, company, monthly, first] = await Promise.all([
    admin
      .from("staff")
      .select("id,first_name,last_name,email,rut,role")
      .eq("id", account.staff_id)
      .single(),
    admin
      .from("company_settings")
      .select("legal_name,tax_id,address,city")
      .eq("settings_key", "PRIMARY")
      .single(),
    admin.rpc("calculate_staff_monthly_settlement", {
      p_staff_id: account.staff_id,
      p_month: account.accounting_month,
    }),
    admin
      .from("staff_payment_periods")
      .select("*")
      .eq("account_id", account.id)
      .eq("period_code", "Q1")
      .maybeSingle(),
  ]);
  for (const result of [staff, company, monthly, first])
    if (result.error) throw result.error;
  if (!staff.data || !company.data)
    throw new Error("Faltan datos del trabajador o de BOOMBOX.");
  const projected = { ...period };
  if (!projected.snapshot) {
    const calc = await admin.rpc("staff_payment_period_calculation", {
      p_period_id: periodId,
    });
    if (calc.error) throw calc.error;
    projected.snapshot = calc.data;
  }
  let firstPeriod = first.data;
  if (firstPeriod && !firstPeriod.snapshot) {
    const calc = await admin.rpc("staff_payment_period_calculation", {
      p_period_id: firstPeriod.id,
    });
    if (calc.error) throw calc.error;
    firstPeriod = { ...firstPeriod, snapshot: calc.data };
  }
  return {
    account,
    period: projected,
    monthly: monthly.data,
    first: firstPeriod,
    staff: {
      id: staff.data.id,
      name: `${staff.data.first_name} ${staff.data.last_name}`,
      firstName: staff.data.first_name,
      email: staff.data.email ?? "",
      rut: staff.data.rut ?? "",
      role: staff.data.role ?? "",
    },
    company: {
      legalName: company.data.legal_name,
      taxId: company.data.tax_id,
      address: company.data.address,
      city: company.data.city,
    },
  };
}

export function periodCloseEmailPreview(payload: PeriodDocumentPayload) {
  const input = periodDocumentInput(payload),
    summary = input.periodSummary;
  return {
    recipient: payload.staff.email,
    ...buildStaffPeriodClosedEmail({
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bbox.cl",
      firstName: payload.staff.firstName,
      periodLabel: input.periodTitle,
      firstQuincena: input.firstQuincena,
      periodWork: summary.periodWork,
      monthlyWork: summary.monthlyWork,
      monthlyGross: summary.monthlyGross,
      paid: input.firstQuincena
        ? Number(payload.period.snapshot?.workPaid ?? 0)
        : summary.paid,
      remaining: input.firstQuincena
        ? Number(payload.period.snapshot?.workPending ?? 0)
        : summary.remaining,
      reimbursementsPending: input.firstQuincena
        ? input.account.reimbursementsPendingTotal
        : summary.reimbursementsPending,
      company: payload.company,
    }),
  };
}
