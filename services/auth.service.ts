import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SignInInput } from "@/features/authentication/schemas/auth.schema";

export async function signIn(credentials: SignInInput) {
  const supabase = await createSupabaseServerClient();
  return supabase.auth.signInWithPassword(credentials);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
