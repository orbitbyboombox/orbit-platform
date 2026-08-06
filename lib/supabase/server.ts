import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getSupabaseServerConfig() {
  const cookieStore = await cookies();
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Missing Supabase environment variables.");
  return { cookieStore, publishableKey, url };
}

export async function createSupabaseServerClient() {
  const { cookieStore, publishableKey, url } = await getSupabaseServerConfig();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
    },
  });
}

export async function createSupabaseServerActionClient() {
  const { cookieStore, publishableKey, url } = await getSupabaseServerConfig();
  return createServerClient(url, publishableKey, {
    cookieOptions: {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}

export async function hasSupabaseAuthCookie() {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .some(({ name, value }) => name.startsWith("sb-") && name.includes("-auth-token") && value.length > 0);
}
