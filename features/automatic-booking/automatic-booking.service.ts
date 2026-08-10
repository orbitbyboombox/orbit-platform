import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
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
    const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;background:#111;color:#fff;border-radius:20px"><p style="color:#f28e2b;font-weight:700;letter-spacing:.14em">BOOMBOX</p><h1>Tu experiencia comienza aquí.</h1><p>Completa los datos de tu evento, elige tu servicio, revisa el contrato y confirma tu reserva desde un único proceso seguro.</p><p style="margin:28px 0"><a href="${url}" style="display:inline-block;background:#f28e2b;color:#111;padding:14px 22px;border-radius:12px;font-weight:700;text-decoration:none">Completar mi reserva</a></p><p style="color:#aaa;font-size:13px">Este enlace es personal, vence en 7 días y funciona una sola vez.</p></div>`;
    const result = await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({ to: customerEmail, subject, textBody: `Completa tu Reserva BOOMBOX: ${url}\n\nEste enlace vence en 7 días y funciona una sola vez.`, htmlBody, driveFileIds: [] });
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
  const { data, error } = await admin.from("automatic_booking_invitations").select("id,customer_email,status,expires_at,opened_at").eq("token_hash", hash(token)).gt("expires_at", now).is("consumed_at", null).in("status", ["SENT", "OPENED"]).maybeSingle();
  if (error || !data) return null;
  if (!data.opened_at) await admin.from("automatic_booking_invitations").update({ opened_at: now, status: "OPENED" }).eq("id", data.id).eq("status", "SENT");
  return data;
}

export const automaticBookingTokenHash = hash;
