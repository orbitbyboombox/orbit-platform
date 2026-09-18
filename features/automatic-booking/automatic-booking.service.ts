import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderBoomboxCommercialEmail } from "@/features/connectors/google-gmail/application/boombox-commercial-email.html";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const appOrigin = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl";

export async function createAutomaticBookingInvitation(email: string, actorId: string) {
  const customerEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("Ingresa un correo válido.");
  const admin = createAdminClient();
  await admin.from("automatic_booking_invitations").update({ status: "REVOKED" }).eq("customer_email", customerEmail).is("consumed_at", null).in("status", ["SENT", "OPENED"]);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { data: invitation, error } = await admin.from("automatic_booking_invitations").insert({ customer_email: customerEmail, token_hash: hash(token), expires_at: expiresAt, created_by: actorId }).select("id").single();
  if (error) throw error;
  const url = `${appOrigin()}/booking/${token}`;
  try {
    const subject = "✨ Completa tu Reserva BOOMBOX";
    const htmlBody = renderBoomboxCommercialEmail({
      preheader: "Tu acceso ya está listo para completar tu reserva de forma rápida, clara y segura.",
      eyebrow: "BOOMBOX",
      title: "¡Bienvenido a BOOMBOX!",
      headerLabel: "EVENTOS QUE CONECTAN",
      stackedHeader: true,
      contentHtml: `<p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:22px;line-height:1.3;font-weight:700;color:#ffffff">Tu experiencia comienza aquí.</p><p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#d7d7d9">Completa los datos de tu evento, elige tu servicio, revisa tu contrato y confirma tu reserva desde un único proceso simple, seguro y pensado para ti.</p>`,
      benefits: ["Completar los datos de tu evento", "Elegir tus servicios y complementos", "Revisar tu contrato", "Confirmar tu reserva de forma segura"],
      closingLine: "Cada evento cuenta. Tu experiencia comienza con BOOMBOX.",
      website: "https://boom-box.cl",
      primaryAction: { href: url, label: "COMPLETAR MI RESERVA  →" },
      primaryActionFallback: "Si tienes problemas con el botón, puedes abrir tu reserva",
    });
    const result = await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({ to: customerEmail, subject, textBody: `¡Bienvenido a BOOMBOX!\n\nTu experiencia comienza aquí. Completa los datos de tu evento, elige tus servicios, revisa tu contrato y confirma tu reserva desde un único proceso seguro.\n\nCOMPLETAR MI RESERVA: ${url}\n\nEste enlace personal vence en 7 días y funciona una sola vez.`, htmlBody, driveFileIds: [] });
    await admin.from("automatic_booking_invitations").update({ invitation_message_id: result.messageId }).eq("id", invitation.id);
    return { url, expiresAt };
  } catch (cause) {
    await admin.from("automatic_booking_invitations").update({ status: "REVOKED" }).eq("id", invitation.id);
    throw cause;
  }
}

export async function loadAutomaticBookingInvitation(token: string) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin.from("automatic_booking_invitations").select("id,customer_email,status,expires_at,opened_at,payload").eq("token_hash", hash(token)).gt("expires_at", now).is("consumed_at", null).in("status", ["SENT", "OPENED"]).maybeSingle();
  if (error || !data) return null;
  if (!data.opened_at) await admin.from("automatic_booking_invitations").update({ opened_at: now, status: "OPENED" }).eq("id", data.id).eq("status", "SENT");
  return data;
}

export const automaticBookingTokenHash = hash;
