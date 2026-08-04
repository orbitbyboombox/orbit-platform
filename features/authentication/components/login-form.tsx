"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { LogIn } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { signInAction } from "../actions/auth.actions";
import { signInSchema, type SignInInput } from "../schemas/auth.schema";

export function LoginForm() {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit, formState: { errors } } = useForm<SignInInput>({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = (values: SignInInput) => startTransition(async () => {
    setServerError(undefined);
    const result = await signInAction(values);
    setServerError(result.error);
  });

  return <form className="space-y-4" noValidate onSubmit={handleSubmit(onSubmit)}><div><label className="mb-1.5 block text-sm font-medium" htmlFor="email">Email</label><input aria-describedby={errors.email ? "email-error" : undefined} aria-invalid={Boolean(errors.email)} autoComplete="email" className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2" id="email" type="email" {...register("email")} />{errors.email && <p className="mt-1 text-xs text-danger" id="email-error">Enter a valid email address.</p>}</div><div><label className="mb-1.5 block text-sm font-medium" htmlFor="password">Password</label><input aria-describedby={errors.password ? "password-error" : undefined} aria-invalid={Boolean(errors.password)} autoComplete="current-password" className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2" id="password" type="password" {...register("password")} />{errors.password && <p className="mt-1 text-xs text-danger" id="password-error">Password must be at least 8 characters.</p>}</div>{serverError && <p aria-live="polite" className="rounded-md bg-danger-soft p-3 text-sm text-danger" role="alert">{serverError}</p>}<ActionButton className="w-full" disabled={isPending} icon={LogIn} label={isPending ? "Signing in…" : "Sign in"} type="submit" /></form>;
}
