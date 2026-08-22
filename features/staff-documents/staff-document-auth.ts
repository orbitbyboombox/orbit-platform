import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireStaffDocumentAdministrator() {
  const client = await createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user)
    return { ok: false as const, status: 401, message: "Sesión requerida." };
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profileError || !profile || !["CEO", "ADMINISTRATOR"].includes(profile.role))
    return { ok: false as const, status: 403, message: "Acceso denegado." };
  return { ok: true as const, userId: auth.user.id };
}
