import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Server-only Supabase client for trusted background and connector operations. */
export function createAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    throw new Error("Missing Supabase administrative environment variables.");
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
