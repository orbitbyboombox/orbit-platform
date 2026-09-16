import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import {
  buildMonthlySettlementReadyEmail,
  buildStaffPaymentCompletedEmail,
} from "@/features/staff-communications/staff-email.templates";
import { syncStaffDocumentArchive } from "./drive-archive.service";
import {
  mapStaffMonthlyAccount,
  monthlySettlementPath,
  staffMonthLabel,
  STAFF_MONTHLY_ACCOUNT_SELECT,
  type StaffMonthlyAccount,
} from "./model";
import { createStaffMonthlySettlementPdf } from "./settlement-pdf";

type StaffContact = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  rut: string;
  role: string;
};

const appUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl";

export async function prepareMonthlySettlementDocument(accountId: string) {
  const admin = createAdminClient();
  const { data: row, error: rowError } = await admin
    .from("staff_monthly_accounts")
    .select(STAFF_MONTHLY_ACCOUNT_SELECT)
    .eq("id", accountId)
    .single();
  if (rowError || !row)
    throw rowError ?? new Error("Liquidación mensual no encontrada.");
  const { data: staffRow, error: staffError } = await admin
    .from("staff")
    .select("id,first_name,last_name,email,rut,role")
    .eq("id", row.staff_id)
    .single();
  if (staffError || !staffRow)
    throw staffError ?? new Error("Colaborador no encontrado.");
  const account = mapStaffMonthlyAccount(row);
  const staff: StaffContact = {
    id: staffRow.id,
    firstName: staffRow.first_name,
    lastName: staffRow.last_name,
    name: `${staffRow.first_name} ${staffRow.last_name}`.trim(),
    email: staffRow.email ?? "",
    rut: staffRow.rut ?? "",
    role: staffRow.role ?? "",
  };
  const pdf = await createStaffMonthlySettlementPdf({ account, staff });
  const path = monthlySettlementPath(account.staffId, account.month);
  const upload = await admin.storage
    .from("orbit-documents")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (upload.error) throw upload.error;

  const { data: existingDocument, error: documentReadError } = await admin
    .from("staff_onboarding_documents")
    .select("id")
    .eq("staff_id", account.staffId)
    .eq("storage_bucket", "orbit-documents")
    .eq("storage_path", path)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (documentReadError) throw documentReadError;
  let document = existingDocument;
  if (!document) {
    const inserted = await admin
      .from("staff_onboarding_documents")
      .insert({
        invitation_id: null,
        staff_id: account.staffId,
        document_type: "STAFF_MONTHLY_SETTLEMENT",
        category: "LIQUIDACIONES",
        applicable_month: account.month.slice(0, 7),
        friendly_label: `Liquidación mensual ${account.month.slice(0, 7)}`,
        status: "ACTIVE",
        storage_bucket: "orbit-documents",
        storage_path: path,
        file_name: `liquidacion-staff-${account.month.slice(0, 7)}.pdf`,
        mime_type: "application/pdf",
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    document = inserted.data;
  }
  const link = await admin
    .from("staff_monthly_accounts")
    .update({ settlement_document_id: document.id })
    .eq("id", accountId);
  if (link.error) throw link.error;
  try {
    await syncStaffDocumentArchive(admin, document.id);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "staff_monthly_settlement_drive_archive_failed",
        accountId,
        code: error instanceof Error ? error.name : "DRIVE_ERROR",
      }),
    );
  }
  return { account, staff, pdf, documentId: document.id };
}

async function claimEmail(input: {
  correlationId: string;
  notificationType: string;
  title: string;
  message: string;
  account: StaffMonthlyAccount;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("internal_notifications")
    .upsert(
      {
        staff_id: input.account.staffId,
        notification_type: input.notificationType,
        title: input.title,
        message: input.message,
        status: "UNREAD",
        correlation_id: input.correlationId,
        category: "STAFF",
        priority: "NORMAL",
        action_required: false,
        entity_type: "StaffMonthlyAccount",
        entity_id: input.account.id,
        related_href: "/staff-portal",
        metadata: {
          email_status: "CLAIMED",
          accounting_month: input.account.month,
        },
      },
      { onConflict: "correlation_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  if (data?.[0]?.id) return String(data[0].id);
  const { data: existing, error: existingError } = await admin
    .from("internal_notifications")
    .select("id,metadata")
    .eq("correlation_id", input.correlationId)
    .maybeSingle();
  if (existingError) throw existingError;
  const metadata =
    existing?.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};
  if (metadata.email_status === "FAILED_REQUIRES_RECONCILIATION") {
    throw new Error(
      `El correo ${input.correlationId} requiere conciliación antes de continuar.`,
    );
  }
  return null;
}

async function markEmail(id: string, metadata: Record<string, unknown>) {
  const { error } = await createAdminClient()
    .from("internal_notifications")
    .update({ metadata })
    .eq("id", id);
  if (error) throw error;
}

export async function sendMonthlySettlementReadyEmail(
  input: Awaited<ReturnType<typeof prepareMonthlySettlementDocument>>,
) {
  if (!input.staff.email)
    throw new Error(`El Staff ${input.staff.name} no tiene email.`);
  const correlationId = `staff-monthly-settlement-ready:${input.account.id}`;
  const notificationId = await claimEmail({
    correlationId,
    notificationType: "STAFF_MONTHLY_SETTLEMENT_READY",
    title: "Tu liquidación mensual BOOMBOX está lista",
    message: `${staffMonthLabel(input.account.month)} · Boleta ${input.account.boletaGross}`,
    account: input.account,
  });
  if (!notificationId) return { sent: false, idempotent: true };
  try {
    const email = buildMonthlySettlementReadyEmail({
      appUrl: appUrl(),
      firstName: input.staff.firstName,
      monthLabel: staffMonthLabel(input.account.month),
      boletaGross: input.account.boletaGross,
      finalTransfer: input.account.finalTransferAmount,
    });
    const sent = await new GoogleGmailApiProvider(
      await loadGoogleWorkspaceAccessToken(),
    ).send({
      to: input.staff.email,
      subject: email.subject,
      textBody: email.textBody,
      htmlBody: email.htmlBody,
      driveFileIds: [],
      attachments: [
        {
          filename: `Liquidacion-BOOMBOX-${input.account.month.slice(0, 7)}.pdf`,
          mimeType: "application/pdf",
          content: new Uint8Array(input.pdf),
        },
      ],
      idempotencyKey: correlationId,
      maxSendAttempts: 1,
    });
    await markEmail(notificationId, {
      email_status: "SENT",
      accounting_month: input.account.month,
      message_id: sent.messageId,
      sent_at: new Date().toISOString(),
      attachment_document_id: input.documentId,
    });
    return { sent: true, idempotent: false };
  } catch (error) {
    await markEmail(notificationId, {
      email_status: "FAILED_REQUIRES_RECONCILIATION",
      accounting_month: input.account.month,
      error: error instanceof Error ? error.message : "Unknown",
    });
    throw error;
  }
}

export async function sendMonthlyPaymentCompletedEmail(accountId: string) {
  const prepared = await prepareMonthlySettlementDocument(accountId);
  if (prepared.account.paymentStatus !== "PAID")
    return { sent: false, idempotent: true };
  if (!prepared.staff.email)
    throw new Error(`El Staff ${prepared.staff.name} no tiene email.`);
  const correlationId = `staff-monthly-payment-completed:${prepared.account.id}`;
  const notificationId = await claimEmail({
    correlationId,
    notificationType: "STAFF_MONTHLY_PAYMENT_COMPLETED",
    title: "PAGO REALIZADO",
    message: `${staffMonthLabel(prepared.account.month)} · ${prepared.account.paidAmount}`,
    account: prepared.account,
  });
  if (!notificationId) return { sent: false, idempotent: true };
  try {
    const email = buildStaffPaymentCompletedEmail({
      appUrl: appUrl(),
      firstName: prepared.staff.firstName,
      monthLabel: staffMonthLabel(prepared.account.month),
      amount: prepared.account.paidAmount,
      paidOn: prepared.account.paidAt,
    });
    const sent = await new GoogleGmailApiProvider(
      await loadGoogleWorkspaceAccessToken(),
    ).send({
      to: prepared.staff.email,
      subject: email.subject,
      textBody: email.textBody,
      htmlBody: email.htmlBody,
      driveFileIds: [],
      idempotencyKey: correlationId,
      maxSendAttempts: 1,
    });
    await markEmail(notificationId, {
      email_status: "SENT",
      accounting_month: prepared.account.month,
      message_id: sent.messageId,
      sent_at: new Date().toISOString(),
      payment_receipt_document_id: prepared.account.receiptDocumentId,
    });
    return { sent: true, idempotent: false };
  } catch (error) {
    await markEmail(notificationId, {
      email_status: "FAILED_REQUIRES_RECONCILIATION",
      accounting_month: prepared.account.month,
      error: error instanceof Error ? error.message : "Unknown",
    });
    throw error;
  }
}
