import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getGoogleWorkspaceAdministrator() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: string }>();
  return data?.role === "CEO" || data?.role === "ADMINISTRATOR" ? user : null;
}
