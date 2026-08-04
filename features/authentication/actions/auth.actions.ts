"use server";

import { redirect } from "next/navigation";
import { signInSchema, type SignInInput } from "../schemas/auth.schema";
import { signIn, signOut } from "@/services/auth.service";

export interface AuthActionResult {
  error?: string;
}

export async function signInAction(input: SignInInput): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const { error } = await signIn(parsed.data);
  if (error) {
    console.error({
      message: error.message,
      code: error.code,
      status: error.status,
    });
    return { error: error.message };
  }
  redirect("/");
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}
