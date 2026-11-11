import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertSupabaseEnvironmentSafe, isReadOnlyVisualPreview } from "./environment-guard";
import { makeReadOnlyVisualPreviewClient } from "./read-only-preview";

async function getSupabaseServerConfig() {
  const cookieStore = await cookies();
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Missing Supabase environment variables.");
  assertSupabaseEnvironmentSafe(url);
  return { cookieStore, publishableKey, url };
}

const authCookieOptions={httpOnly:true,path:"/",maxAge:60*60*24*365,sameSite:"lax" as const,secure:process.env.NODE_ENV==="production"};

const createRequestScopedServerClient = cache(async () => {
  const { cookieStore, publishableKey, url } = await getSupabaseServerConfig();
  const client = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
    },
  });
  // RSC memoization lives only for one render request, never across users.
  // Layout and page both validate the same user; share the network result.
  client.auth.getUser = cache(client.auth.getUser.bind(client.auth));
  return isReadOnlyVisualPreview() ? makeReadOnlyVisualPreviewClient(client) : client;
});

export async function createSupabaseServerClient() {
  return createRequestScopedServerClient();
}

export async function createSupabaseServerActionClient() {
  const { cookieStore, publishableKey, url } = await getSupabaseServerConfig();
  const client = createServerClient(url, publishableKey, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value, options }) => cookieStore.set(name,value,{...authCookieOptions,...options}));
      },
    },
  });
  return isReadOnlyVisualPreview() ? makeReadOnlyVisualPreviewClient(client) : client;
}

export async function hasSupabaseAuthCookie() {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .some(({ name, value }) => name.startsWith("sb-") && name.includes("-auth-token") && value.length > 0);
}
