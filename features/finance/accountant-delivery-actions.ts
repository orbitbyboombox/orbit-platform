"use server";

import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getGoogleWorkspaceAdministrator } from "@/features/connectors/google-workspace/application/google-workspace.authorization.guard";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountantPeriodPattern, accountantPreviewProof, buildAccountantDelivery, loadAccountantDeliveryState } from "./accountant-delivery";

const accountantPath = "/finance/tributary/accountant-delivery";

export async function saveAccountantRecipient(form: FormData) {
  const actor = await getGoogleWorkspaceAdministrator();
  if (!actor) throw new Error("Acceso restringido.");
  const recipient = String(form.get("recipient") ?? "").trim().toLowerCase();
  if (recipient.length > 254 || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(recipient)) throw new Error("Correo contable inválido.");
  const { error } = await createAdminClient().from("accountant_delivery_settings")
    .upsert({ singleton: true, recipient, updated_by: actor.id, updated_at: new Date().toISOString() });
  if (error) throw new Error("No se pudo guardar el destinatario contable.");
  revalidatePath(accountantPath);
}

export async function sendApprovedAccountantPackage(form: FormData) {
  const actor = await getGoogleWorkspaceAdministrator();
  if (!actor) throw new Error("Acceso restringido.");
  const period = String(form.get("period") ?? "");
  const proof = String(form.get("proof") ?? "");
  if (!accountantPeriodPattern.test(period) || !/^[0-9a-f]{64}$/.test(proof) || form.get("approved") !== "yes") {
    throw new Error("Falta la aprobación administrativa de esta vista previa.");
  }
  const state = await loadAccountantDeliveryState(period);
  if (!state.recipient || !state.closed || state.delivery) throw new Error("El período debe estar cerrado, tener destinatario y carecer de un envío previo.");
  const packaged = await buildAccountantDelivery(period);
  const expected = accountantPreviewProof(actor.id, period, state.recipient, packaged.checksum);
  if (!timingSafeEqual(Buffer.from(proof, "hex"), Buffer.from(expected, "hex"))) throw new Error("El paquete o destinatario cambió. Revisa la nueva vista previa.");
  const token = await loadGoogleWorkspaceAccessToken();
  const admin = createAdminClient();
  const periodStart = `${period}-01`;
  const { data: claimed, error } = await admin.rpc("claim_accountant_package_delivery", {
    p_period: periodStart, p_recipient: state.recipient, p_checksum: packaged.checksum, p_actor: actor.id,
  });
  if (error || claimed !== true) throw new Error("El período cambió, ya existe un intento o el historial no está disponible.");
  const escaped = packaged.summary.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  try {
    const delivered = await new GoogleGmailApiProvider(token).send({
      to: state.recipient,
      subject: `BOOMBOX® · Cierre contable ${period}`,
      textBody: `BOOMBOX® · Cierre contable ${period}\n\n${packaged.summary}\n\nwww.bbox.cl · contacto@bbox.cl`,
      htmlBody: `<div style="font:15px Arial;color:#171717"><h1 style="background:#171717;color:#fff;padding:20px">BOOMBOX®</h1><h2 style="color:#985007">Cierre contable ${period}</h2><p style="white-space:pre-line">${escaped}</p><p><a href="https://www.bbox.cl">www.bbox.cl</a> · <a href="mailto:contacto@bbox.cl">contacto@bbox.cl</a></p></div>`,
      attachments: packaged.attachments, driveFileIds: [], maxSendAttempts: 1,
      idempotencyKey: `accountant-delivery-${period}`,
    });
    const result = await admin.from("accountant_package_deliveries").update({
      status: "SENT", sent_at: new Date().toISOString(), gmail_message_id: delivered.messageId,
    }).eq("period", periodStart).eq("status", "SENDING");
    if (result.error) throw result.error;
  } catch {
    await admin.from("accountant_package_deliveries").update({ status: "REVIEW_REQUIRED" }).eq("period", periodStart).eq("status", "SENDING");
    revalidatePath(accountantPath);
    throw new Error("El envío requiere verificación antes de cualquier reintento.");
  }
  revalidatePath(accountantPath);
}
