"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdministrativeRole } from "@/lib/auth/roles";

export async function updateWebQuoteAction(form: FormData): Promise<void> {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!isAdministrativeRole(profile?.role)) throw new Error("Acceso administrativo requerido.");
  const id = String(form.get("solicitudId") ?? ""); const status = String(form.get("status") ?? "");
  if (!/^[a-zA-Z0-9_-]{16,120}$/.test(id) || !["NEW", "REVIEWED", "ARCHIVED"].includes(status)) throw new Error("Solicitud no válida.");
  const { error } = await createAdminClient().from("web_quote_leads").update({ status, review_notes: String(form.get("notes") ?? "").trim().slice(0,2000), updated_at: new Date().toISOString(), updated_by: auth.user.id }).eq("solicitud_id", id).eq("is_test", false);
  if (error) throw new Error("No se pudo guardar la revisión.");
  // Never sends customer email or converts a request into a reservation.
  revalidatePath("/leads");
}
