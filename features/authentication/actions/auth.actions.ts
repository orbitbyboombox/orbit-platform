"use server";

import { redirect } from "next/navigation";
import { signInSchema, type SignInInput } from "../schemas/auth.schema";
import { signIn, signOut } from "@/services/auth.service";
import { hasSupabaseAuthCookie } from "@/lib/supabase/server";
import { recordAdministratorAccess } from "@/features/notification-center/repository";

export interface AuthActionResult {
  error?: string;
}

export async function signInAction(input: SignInInput): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { error: "Ingresa un correo y una contraseña válidos." };

  let result: Awaited<ReturnType<typeof signIn>>;
  try {
    result = await signIn(parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to persist the authentication session.";
    console.error({ message, code: "SESSION_PERSISTENCE_ERROR" });
    return { error: "No fue posible iniciar la sesión. Inténtalo nuevamente." };
  }

  const { data, error } = result;
  if (error) {
    console.error({
      message: error.message,
      code: error.code,
      status: error.status,
    });
    await recordAdministratorAccess("FAILED").catch((notificationError)=>console.error({message:notificationError instanceof Error?notificationError.message:"No fue posible registrar el intento de acceso.",code:"SECURITY_NOTIFICATION_ERROR"}));
    return { error: "No fue posible validar tus credenciales." };
  }
  if (!data.session) {
    console.error({ message: "Supabase did not create an authentication session.", code: "SESSION_MISSING" });
    return { error: "No fue posible crear una sesión segura." };
  }
  if (!(await hasSupabaseAuthCookie())) {
    console.error({ message: "Supabase session cookie was not persisted.", code: "SESSION_COOKIE_MISSING" });
    return { error: "No fue posible mantener la sesión. Inténtalo nuevamente." };
  }
  await recordAdministratorAccess("SUCCESS",data.user.id).catch((notificationError)=>console.error({message:notificationError instanceof Error?notificationError.message:"No fue posible registrar el acceso.",code:"SECURITY_NOTIFICATION_ERROR"}));
  redirect("/operations");
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}
