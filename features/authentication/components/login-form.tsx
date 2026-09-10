"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Eye, EyeOff, LockKeyhole, LogIn, Mail } from "lucide-react";
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
    <form className="access-form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label htmlFor="email">Correo electrónico</label>
        <div className="input-wrap"><Mail size={17} /><input aria-describedby={errors.email ? "email-error" : undefined} aria-invalid={Boolean(errors.email)} autoComplete="email" id="email" type="email" {...register("email")} /></div>
        {errors.email && <p className="mt-1.5 text-xs text-danger" id="email-error">Ingresa un correo electrónico válido.</p>}
      </div>
      <div>
        <label htmlFor="password">Contraseña</label>
        <div className="input-wrap"><LockKeyhole size={17} /><input aria-describedby={errors.password ? "password-error" : undefined} aria-invalid={Boolean(errors.password)} autoComplete="current-password" id="password" type={showPassword ? "text" : "password"} {...register("password")} /><button aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} className="password-toggle" onClick={() => setShowPassword(value => !value)} type="button">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        {errors.password && <p className="mt-1.5 text-xs text-danger" id="password-error">La contraseña debe tener al menos 8 caracteres.</p>}
      </div>
      <div className="access-options">
        <label className="remember" htmlFor="remember-session">
          <input defaultChecked id="remember-session" name="remember" type="checkbox" />
          Mantener sesión iniciada
        </label>
        <a className="forgot" href="mailto:admin@orbit.boom-box.cl?subject=Recuperar%20acceso%20a%20ORBIT">¿Olvidaste tu contraseña?</a>
      </div>
      {(serverError ?? initialMessage) && <p aria-live="polite" className="access-error" role="alert">{serverError ?? initialMessage}</p>}
      <ActionButton className="access-submit" disabled={isPending} icon={LogIn} label={isPending ? "Verificando…" : "INGRESAR A ORBIT"} type="submit" />
    </form>
  );
}
