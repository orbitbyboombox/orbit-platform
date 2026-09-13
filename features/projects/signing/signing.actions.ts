"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSigningInvitation, SigningInvitationError } from "./digital-signature.service";

export async function createSigningInvitationAction(agreementId: string, projectId: string): Promise<{ ok: true; url: string; expiresAt: string; draftPrepared: boolean; warning?: string } | { ok: false; error: string }> {
  try { const client = await createSupabaseServerClient(); const { data, error } = await client.auth.getUser(); if (error || !data.user) throw error ?? new Error("Sesión requerida."); const invitation = await createSigningInvitation(agreementId, data.user.id); revalidatePath(`/projects/${projectId}`); return { ok: true, ...invitation }; }
  catch (error) {
    const value = typeof error === "object" && error !== null ? error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown } : {};
    const message = error instanceof SigningInvitationError ? `${error.code}: ${error.message}` : typeof value.message === "string" ? value.message : error instanceof Error ? error.message : "No fue posible preparar el acuerdo (SIGNATURE_LINK_PREP_FAILED).";
    const sanitize = (input: unknown) => typeof input === "string" ? input.replace(/(access_token|refresh_token|client_secret|client_id)=[^\s&]+/gi, "$1=[redacted]") : undefined;
    console.error(JSON.stringify({ event: "signature_link_preparation_failed", projectId, agreementId, stage: error instanceof SigningInvitationError ? error.stage : "UNKNOWN", code: error instanceof SigningInvitationError ? error.code : typeof value.code === "string" ? value.code : "SIGNATURE_LINK_PREP_FAILED", message: sanitize(message), details: sanitize(error instanceof SigningInvitationError ? error.details : value.details), hint: sanitize(error instanceof SigningInvitationError ? error.hint : value.hint) }));
    return { ok: false, error: message };
  }
}
