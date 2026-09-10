"use client";

import { useActionState } from "react";
import { useState } from "react";
import { CalendarDays, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { RutInput } from "@/components/forms/rut-input";
import { customerPortalLoginAction, staffPortalLoginAction } from "./actions";

export function PortalLoginForm({ type, embedded = false }: { type: "CUSTOMER" | "STAFF"; embedded?: boolean }) {
  const action = type === "CUSTOMER" ? customerPortalLoginAction : staffPortalLoginAction;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [showSecret, setShowSecret] = useState(false);
  const customer = type === "CUSTOMER";
  const content = <>
    <div className="bbox-access-heading"><p>ACCESO {customer ? "CLIENTES" : "OPERATIVO"}</p><h2>{customer ? "Portal Clientes" : "Staff"}</h2><span>{customer ? "Gestiona tu evento BOOMBOX." : "Acceso al portal operativo BOOMBOX."}</span></div>
    <form action={formAction} className="bbox-portal-form"><label className="bbox-field">RUT<RutInput className="bbox-input min-h-12" /></label>{customer ? <label className="bbox-field">Fecha del evento<div className="bbox-input-with-icon"><CalendarDays /><input className="min-h-12" name="eventDate" required type="date"/></div></label> : <label className="bbox-field">Contraseña<div className="bbox-input-with-icon"><KeyRound /><input className="min-h-12" autoComplete="current-password" minLength={4} name="pin" required type={showSecret ? "text" : "password"}/><button aria-label={showSecret ? "Ocultar contraseña" : "Mostrar contraseña"} className="bbox-password-toggle" onClick={() => setShowSecret((value) => !value)} type="button">{showSecret ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>}{customer&&state?.events?.length ? <label className="bbox-field">Selecciona tu evento<select className="bbox-input min-h-12" name="projectId" required defaultValue=""><option disabled value="">Selecciona una opción</option>{state.events.map((event) => <option key={event.projectId} value={event.projectId}>{event.orbCode} · {event.time} · {event.location} · {event.service}</option>)}</select></label> : null}<button className="bbox-submit" disabled={pending}>{pending ? "Validando…" : state?.events?.length ? "Continuar con este evento" : "INGRESAR A ORBIT"}<span>↗</span></button>{state?.error&&<p className="bbox-error" role="alert">{state.error}</p>}</form>
    <div className="bbox-private-note"><ShieldCheck size={15}/>Acceso privado y auditado</div>
  </>;
  if (embedded) return <div>{content}</div>;
  return <main className="grid min-h-screen min-w-0 place-items-center bg-background px-4 py-10 text-foreground"><section className="min-w-0 w-full max-w-md rounded-3xl border bg-card p-6 shadow-2xl sm:p-9"><BrandLogo className="mx-auto h-24 w-full max-w-72" priority/>{content}</section></main>;
}
