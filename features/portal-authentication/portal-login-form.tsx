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
    <div className="access-heading"><span>{customer ? "ACCESO SEGURO" : "ACCESO OPERATIVO"}</span><h1>{customer ? "Portal Clientes" : "Portal Staff"}</h1><p>{customer ? "Todo tu evento en un solo lugar." : "Todo lo que necesitas para operar tu evento."}</p></div>
    <form action={formAction} className={embedded ? "access-form" : "mt-7 space-y-4"}><label>RUT<div className={embedded ? "input-wrap" : "relative mt-2"}><RutInput className={embedded ? "" : "min-h-12 w-full rounded-xl border bg-background px-4"} /></div></label>{customer ? <label>Fecha del evento<div className={embedded ? "input-wrap" : "relative mt-2"}><CalendarDays className={embedded ? "" : "pointer-events-none absolute left-4 top-3.5 size-5 text-muted"}/><input className={embedded ? "" : "min-h-12 w-full rounded-xl border bg-background pl-12 pr-4"} name="eventDate" required type="date"/></div></label> : <label>Contraseña<div className={embedded ? "input-wrap" : "relative mt-2"}><KeyRound className={embedded ? "" : "pointer-events-none absolute left-4 top-3.5 size-5 text-muted"}/><input autoComplete="current-password" className={embedded ? "" : "min-h-12 w-full rounded-xl border bg-background pl-12 pr-4"} minLength={4} name="pin" required type="password"/></div></label>}{customer&&state?.events?.length ? <label>Selecciona tu evento<select className={embedded ? "input-wrap" : "mt-2 min-h-12 w-full rounded-xl border bg-background px-3"} name="projectId" required defaultValue=""><option disabled value="">Selecciona una opción</option>{state.events.map((event) => <option key={event.projectId} value={event.projectId}>{event.orbCode} · {event.time} · {event.location} · {event.service}</option>)}</select></label> : null}<button className={embedded ? "access-submit" : "min-h-12 w-full rounded-xl bg-brand font-semibold text-brand-foreground transition-colors disabled:opacity-60"} disabled={pending}>{pending ? "Validando…" : state?.events?.length ? "Continuar con este evento" : "Ingresar"}</button>{state?.error&&<p className={embedded ? "access-error" : "rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger"} role="alert">{state.error}</p>}</form>
    <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted"><ShieldCheck className="size-4"/>Acceso privado y auditado</div>
  </>;
  if (embedded) return <div>{content}</div>;
  return <main className="grid min-h-screen min-w-0 place-items-center bg-background px-4 py-10 text-foreground"><section className="min-w-0 w-full max-w-md rounded-3xl border bg-card p-6 shadow-2xl sm:p-9"><BrandLogo className="mx-auto h-24 w-full max-w-72" priority/>{content}</section></main>;
}
