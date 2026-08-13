"use client";

import { useActionState } from "react";
import { CalendarDays, KeyRound, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { RutInput } from "@/components/forms/rut-input";
import { customerPortalLoginAction, staffPortalLoginAction } from "./actions";

export function PortalLoginForm({ type, embedded = false }: { type: "CUSTOMER" | "STAFF"; embedded?: boolean }) {
  const action = type === "CUSTOMER" ? customerPortalLoginAction : staffPortalLoginAction;
  const [state, formAction, pending] = useActionState(action, undefined);
  const customer = type === "CUSTOMER";
  const content = <>
    <div className="text-center"><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Acceso seguro</p><h2 className="mt-2 text-2xl font-semibold">{customer ? "Portal Clientes" : "Portal Staff"}</h2><p className="mt-3 text-sm leading-6 text-muted">{customer ? "Todo tu evento en un solo lugar." : "Todo lo que necesitas para operar tu evento."}</p></div>
    <form action={formAction} className="mt-7 space-y-4"><label className="block text-sm font-medium">RUT<RutInput className="mt-2 min-h-12 w-full rounded-xl border bg-background px-4" /></label>{customer ? <label className="block text-sm font-medium">Fecha del evento<div className="relative mt-2"><CalendarDays className="pointer-events-none absolute left-4 top-3.5 size-5 text-muted"/><input className="min-h-12 w-full rounded-xl border bg-background pl-12 pr-4" name="eventDate" required type="date"/></div></label> : <label className="block text-sm font-medium">Contraseña<div className="relative mt-2"><KeyRound className="pointer-events-none absolute left-4 top-3.5 size-5 text-muted"/><input autoComplete="current-password" className="min-h-12 w-full rounded-xl border bg-background pl-12 pr-4" minLength={4} name="pin" required type="password"/></div></label>}<button className="min-h-12 w-full rounded-xl bg-brand font-semibold text-brand-foreground transition-colors disabled:opacity-60" disabled={pending}>{pending ? "Validando…" : "Ingresar"}</button>{state?.error&&<p className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger" role="alert">{state.error}</p>}</form>
    <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted"><ShieldCheck className="size-4"/>Acceso privado y auditado</div>
  </>;
  if (embedded) return <div>{content}</div>;
  return <main className="grid min-h-screen min-w-0 place-items-center bg-background px-4 py-10 text-foreground"><section className="min-w-0 w-full max-w-md rounded-3xl border bg-card p-6 shadow-2xl sm:p-9"><BrandLogo className="mx-auto h-24 w-full max-w-72" priority/>{content}</section></main>;
}
