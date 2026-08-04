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

  return <form className="space-y-5" noValidate onSubmit={handleSubmit(onSubmit)}><div><label className="mb-2 block text-sm font-medium" htmlFor="email">Correo electrónico</label><input aria-describedby={errors.email ? "email-error" : undefined} aria-invalid={Boolean(errors.email)} autoComplete="email" className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2" id="email" type="email" {...register("email")} />{errors.email && <p className="mt-1 text-xs text-danger" id="email-error">Ingresa un correo electrónico válido.</p>}</div><div><label className="mb-2 block text-sm font-medium" htmlFor="password">Contraseña</label><input aria-describedby={errors.password ? "password-error" : undefined} aria-invalid={Boolean(errors.password)} autoComplete="current-password" className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2" id="password" type="password" {...register("password")} />{errors.password && <p className="mt-1 text-xs text-danger" id="password-error">La contraseña debe tener al menos 8 caracteres.</p>}</div>{serverError && <p aria-live="polite" className="rounded-md bg-danger-soft p-3 text-sm text-danger" role="alert">{serverError}</p>}<ActionButton className="mt-2 h-11 w-full" disabled={isPending} icon={LogIn} label={isPending ? "Iniciando sesión..." : "Iniciar sesión"} type="submit" /></form>;
}
