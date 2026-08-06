"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSigningInvitation } from "./digital-signature.service";

export async function createSigningInvitationAction(agreementId: string, projectId: string): Promise<{ ok: true; url: string; expiresAt: string } | { ok: false; error: string }> {
  try { const client = await createSupabaseServerClient(); const { data, error } = await client.auth.getUser(); if (error || !data.user) throw error ?? new Error("Sesión requerida."); const invitation = await createSigningInvitation(agreementId, data.user.id); revalidatePath(`/projects/${projectId}`); return { ok: true, ...invitation }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible preparar el acuerdo." }; }
}
