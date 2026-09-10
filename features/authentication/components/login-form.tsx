"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { signInAction } from "../actions/auth.actions";
import { signInSchema, type SignInInput } from "../schemas/auth.schema";

interface LoginFormProps {
  initialMessage?: string;
}

export function LoginForm({ initialMessage }: LoginFormProps) {
  const [serverError, setServerError] = useState<string>();
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit, formState: { errors } } = useForm<SignInInput>({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = (values: SignInInput) => startTransition(async () => {
    setServerError(undefined);
    const result = await signInAction(values);
    setServerError(result.error);
  });

  return (
    <form className="space-y-3" noValidate onSubmit={handleSubmit(onSubmit)}>
      <div className="bbox-field">
        <label htmlFor="email">Correo electrónico</label>
        <input aria-describedby={errors.email ? "email-error" : undefined} aria-invalid={Boolean(errors.email)} autoComplete="email" id="email" type="email" {...register("email")} />
        {errors.email && <p className="mt-1.5 text-xs text-danger" id="email-error">Ingresa un correo electrónico válido.</p>}
      </div>
      <div className="bbox-field">
        <label htmlFor="password">Contraseña</label>
        <div className="bbox-password-wrap"><input aria-describedby={errors.password ? "password-error" : undefined} aria-invalid={Boolean(errors.password)} autoComplete="current-password" id="password" type={showPassword ? "text" : "password"} {...register("password")} /><button aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} className="bbox-password-toggle" onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        {errors.password && <p className="mt-1.5 text-xs text-danger" id="password-error">La contraseña debe tener al menos 8 caracteres.</p>}
      </div>
      <div className="bbox-access-options">
        <label className="bbox-remember" htmlFor="remember-session">
          <input defaultChecked id="remember-session" name="remember" type="checkbox" />
          Mantener sesión iniciada
        </label>
        <a href="mailto:admin@orbit.boom-box.cl?subject=Recuperar%20acceso%20a%20ORBIT">¿Olvidaste tu contraseña?</a>
      </div>
      {(serverError ?? initialMessage) && <p aria-live="polite" className="rounded-lg border border-danger/20 bg-danger-soft p-3 text-sm text-danger" role="alert">{serverError ?? initialMessage}</p>}
      <ActionButton className="bbox-submit" disabled={isPending} icon={LogIn} label={isPending ? "Iniciando sesión..." : "INGRESAR A ORBIT"} type="submit" />
    </form>
  );
}
