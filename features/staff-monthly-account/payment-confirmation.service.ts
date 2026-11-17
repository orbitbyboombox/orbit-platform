import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { buildStaffPaymentPaidEmail } from "@/features/staff-communications/staff-email.templates";
import { periodLabel } from "./payment-periods.model";

/** Does not create or change payments. Sends only a committed payment with its stored receipt. */
export async function sendStaffPaymentConfirmation(paymentId: string, testOnly = false) {
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) throw new Error("Pago inválido.");
  const admin = createAdminClient();
  const payment = await admin.from("staff_period_payments").select("id,period_id,amount,paid_on,reference,receipt_document_id").eq("id", paymentId).single();
  if (payment.error || !payment.data) throw payment.error ?? new Error("Pago no registrado.");
  const p = payment.data;
  if (!p.receipt_document_id) throw new Error("Pago sin comprobante bancario.");
  const period = await admin.from("staff_payment_periods").select("account_id,period_code").eq("id", p.period_id).single();
  if (period.error || !period.data) throw period.error ?? new Error("Período no encontrado.");
  const account = await admin.from("staff_monthly_accounts").select("staff_id").eq("id", period.data.account_id).single();
  if (account.error || !account.data) throw account.error ?? new Error("Cuenta no encontrada.");
  const [staff, document, refunds] = await Promise.all([
    admin.from("staff").select("first_name,email").eq("id", account.data.staff_id).single(),
    admin.from("staff_onboarding_documents").select("storage_bucket,storage_path,file_name,mime_type").eq("id", p.receipt_document_id).single(),
    admin.from("staff_reimbursement_payments").select("amount,receipt_document_id").eq("staff_id", account.data.staff_id).eq("receipt_document_id", p.receipt_document_id),
  ]);
  for (const r of [staff, document, refunds]) if (r.error) throw r.error;
  if (!staff.data?.email || !document.data || !p.reference) throw new Error("Faltan destinatario, referencia o comprobante.");
  const reimbursement = (refunds.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const honoraria = Number(p.amount);
  const total = honoraria + reimbursement;
  const email = buildStaffPaymentPaidEmail({
    firstName: staff.data.first_name,
    periodLabel: periodLabel(period.data.period_code),
    paidOn: p.paid_on,
    reference: p.reference,
    honoraria,
    reimbursements: reimbursement,
    total,
  });
  const receipt = await admin.storage.from(document.data.storage_bucket).download(document.data.storage_path);
  if (receipt.error || !receipt.data) throw receipt.error ?? new Error("Comprobante no disponible.");
  const bytes = new Uint8Array(await receipt.data.arrayBuffer());
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error("Comprobante inválido.");
  const recipient = testOnly ? "matias.maira.larrain@gmail.com" : staff.data.email;
  if (testOnly) {
    const sent = await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({
      to: recipient, subject: "[PRUEBA ORBIT] " + email.subject,
      textBody: "PRUEBA — No confirma un nuevo pago.\n\n" + email.textBody,
      htmlBody: email.htmlBody,
      driveFileIds: [],
      attachments: [{filename: document.data.file_name, mimeType: document.data.mime_type, content: bytes}],
      maxSendAttempts: 1,
    });
    return {sent: true, recipient, messageId: sent.messageId};
  }
  const existing = await admin.from("staff_payment_confirmation_outbox").select("id,status").eq("payment_id", p.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    const inserted = await admin.from("staff_payment_confirmation_outbox").insert({payment_id:p.id,recipient}).select("id").single();
    if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
  }
  const attemptId = randomUUID();
  const claimed = await admin.from("staff_payment_confirmation_outbox")
    .update({status:"SENDING",attempt_id:attemptId,updated_at:new Date().toISOString()})
    .eq("payment_id",p.id).eq("status","PENDING").select("id").maybeSingle();
  if (claimed.error) throw claimed.error;
  if (!claimed.data) throw new Error("Confirmación ya enviada, en curso o con resultado incierto. Revisa el historial.");
  const attempt = await admin.from("staff_payment_confirmation_attempts").insert({outbox_id:claimed.data.id,attempt_id:attemptId,recipient,status:"SENDING"});
  if (attempt.error) throw attempt.error;
  let transmitting = false;
  try {
    const token = await loadGoogleWorkspaceAccessToken();
    transmitting = true;
    const sent = await new GoogleGmailApiProvider(token).send({
      to: recipient, subject: email.subject, textBody: email.textBody, htmlBody: email.htmlBody,
      driveFileIds: [], attachments: [{filename:document.data.file_name,mimeType:document.data.mime_type,content:bytes}],
      idempotencyKey: "staff-payment-confirmation-" + p.id,
      maxSendAttempts: 1,
    });
    const at = new Date().toISOString();
    const saved = await admin.from("staff_payment_confirmation_outbox").update({status:"SENT",gmail_message_id:sent.messageId,sent_at:at,updated_at:at}).eq("id",claimed.data.id).eq("attempt_id",attemptId);
    if (saved.error) throw saved.error;
    await admin.from("staff_payment_confirmation_attempts").update({status:"SENT",gmail_message_id:sent.messageId,finished_at:at}).eq("attempt_id",attemptId);
    return {sent:true,recipient,messageId:sent.messageId};
  } catch (error) {
    const status = transmitting ? "UNKNOWN" : "FAILED";
    await admin.from("staff_payment_confirmation_outbox").update({status,last_error:String(error),updated_at:new Date().toISOString()}).eq("id",claimed.data.id).eq("attempt_id",attemptId);
    await admin.from("staff_payment_confirmation_attempts").update({status,error:String(error),finished_at:new Date().toISOString()}).eq("attempt_id",attemptId);
    throw error;
  }
}
