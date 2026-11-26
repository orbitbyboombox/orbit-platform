import "server-only";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { productionSupabaseProjectRef } from "@/lib/supabase/environment-guard";

export async function requireTributaryAccess() {
  const url = process.env.SUPABASE_URL;
  const expected = process.env.ORBIT_TRIBUTARY_ISOLATED_PROJECT_REF;
  if (process.env.ORBIT_ENVIRONMENT !== "preview" ||
      process.env.ORBIT_TRIBUTARY_PREVIEW !== "true" || !url || !expected ||
      expected === productionSupabaseProjectRef ||
      expected === process.env.ORBIT_PRODUCTION_SUPABASE_PROJECT_REF ||
      new URL(url).origin !== `https://${expected}.supabase.co`) notFound();
  const client = await createSupabaseServerClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) notFound();
  const profile = await client.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if (profile.error || !["CEO","ADMINISTRATOR"].includes(profile.data?.role ?? "")) notFound();
  return client;
}
