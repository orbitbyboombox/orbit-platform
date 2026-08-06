"use server";

import { redirect } from "next/navigation";
import { signInSchema, type SignInInput } from "../schemas/auth.schema";
import { signIn, signOut } from "@/services/auth.service";
import { hasSupabaseAuthCookie } from "@/lib/supabase/server";

export interface AuthActionResult {
  error?: string;
}

export async function signInAction(input: SignInInput): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a valid email and password." };

  let result: Awaited<ReturnType<typeof signIn>>;
  try {
    result = await signIn(parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to persist the authentication session.";
    console.error({ message, code: "SESSION_PERSISTENCE_ERROR" });
    return { error: message };
  }

  const { data, error } = result;
  if (error) {
    console.error({
      message: error.message,
      code: error.code,
      status: error.status,
    });
    return { error: error.message };
  }
  if (!data.session) {
    console.error({ message: "Supabase did not create an authentication session.", code: "SESSION_MISSING" });
    return { error: "Supabase did not create an authentication session." };
  }
  if (!(await hasSupabaseAuthCookie())) {
    console.error({ message: "Supabase session cookie was not persisted.", code: "SESSION_COOKIE_MISSING" });
    return { error: "Supabase session cookie was not persisted." };
  }
  redirect("/operations");
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}
