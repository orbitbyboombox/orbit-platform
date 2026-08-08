"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { LogIn } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { signInAction } from "../actions/auth.actions";
import { signInSchema, type SignInInput } from "../schemas/auth.schema";

interface LoginFormProps {
  initialMessage?: string;
}

export function LoginForm({ initialMessage }: LoginFormProps) {
  const [serverError, setServerError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit, formState: { errors } } = useForm<SignInInput>({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = (values: SignInInput) => startTransition(async () => {
    setServerError(undefined);
    const result = await signInAction(values);
    setServerError(result.error);
  });

  return (
    <form className="space-y-3" noValidate onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label className="mb-2 block text-sm font-medium" htmlFor="email">Correo electrónico</label>
        <input aria-describedby={errors.email ? "email-error" : undefined} aria-invalid={Boolean(errors.email)} autoComplete="email" className="h-12 w-full rounded-lg border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand/70 focus:ring-2 focus:ring-brand/30" id="email" type="email" {...register("email")} />
        {errors.email && <p className="mt-1.5 text-xs text-danger" id="email-error">Ingresa un correo electrónico válido.</p>}
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium" htmlFor="password">Contraseña</label>
        <input aria-describedby={errors.password ? "password-error" : undefined} aria-invalid={Boolean(errors.password)} autoComplete="current-password" className="h-12 w-full rounded-lg border bg-background px-3.5 text-sm outline-none transition-colors focus:border-brand/70 focus:ring-2 focus:ring-brand/30" id="password" type="password" {...register("password")} />
        {errors.password && <p className="mt-1.5 text-xs text-danger" id="password-error">La contraseña debe tener al menos 8 caracteres.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-muted transition-colors hover:text-foreground" htmlFor="remember-session">
          <input className="size-4 rounded border-border accent-brand" defaultChecked id="remember-session" name="remember" type="checkbox" />
          Mantener sesión iniciada
        </label>
        <a className="flex min-h-11 items-center font-medium text-brand underline-offset-4 transition-colors hover:text-brand/80 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60" href="mailto:admin@orbit.boom-box.cl?subject=Recuperar%20acceso%20a%20ORBIT">¿Olvidaste tu contraseña?</a>
      </div>
      {(serverError ?? initialMessage) && <p aria-live="polite" className="rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger" role="alert">{serverError ?? initialMessage}</p>}
      <ActionButton className="mt-2 h-12 w-full" disabled={isPending} icon={LogIn} label={isPending ? "Iniciando sesión..." : "Iniciar sesión"} type="submit" />
    </form>
  );
}
