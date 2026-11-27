import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { renderBoomboxCommercialEmail } from "@/features/connectors/google-gmail/application/boombox-commercial-email.html";
import {
  loadGoogleWorkspaceAccessToken,
  loadGoogleWorkspaceConnection,
} from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { createAdminClient } from "@/lib/supabase/admin";

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
      preheader: "Completa los datos de tu Reserva BOOMBOX desde tu enlace seguro.",
      eyebrow: "",
      title: "¡Bienvenido a BOOMBOX!",
      headerLabel: "EVENTOS QUE CONECTAN",
      stackedHeader: true,
      contentHtml: "<p>Tu experiencia comienza aquí.</p><p>Una vez dentro podrás:</p><ul><li>Completar los datos de tu evento</li><li>Elegir tus servicios</li><li>Revisar tu contrato</li><li>Confirmar tu reserva</li></ul>",
      website: "https://www.bbox.cl",
      primaryAction: { href: url, label: "COMPLETAR MI RESERVA" },
      contentAfterActionsHtml: '<p style="font-size:13px;color:#d1d1d1">Este enlace es personal, vence en 7 días y funciona una sola vez.</p>',
    });
    const workspace = await loadGoogleWorkspaceConnection();
    const senderEmail = workspace.workspaceAccount?.trim();
    if (!senderEmail) throw new Error("Google Workspace no tiene una cuenta remitente configurada.");
    const accessToken = await loadGoogleWorkspaceAccessToken();
    const result = await new GoogleGmailApiProvider(accessToken).send({ to: customerEmail, from: senderEmail, subject, textBody: `Completa tu Reserva BOOMBOX: ${url}\n\nEste enlace vence en 7 días y funciona una sola vez.`, htmlBody, driveFileIds: [] });
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
