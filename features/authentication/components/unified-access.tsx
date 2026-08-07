"use client";

import { useState } from "react";
import { CalendarHeart, ShieldCheck, UsersRound } from "lucide-react";
import { LoginForm } from "./login-form";
import { PortalLoginForm } from "@/features/portal-authentication/portal-login-form";

export type AccessType = "CUSTOMER" | "STAFF" | "ADMIN";
const options = [
  { id: "CUSTOMER" as const, label: "Clientes", description: "Tu evento, documentos y pagos.", icon: CalendarHeart },
  { id: "STAFF" as const, label: "Staff", description: "Tus asignaciones, tareas y pagos.", icon: UsersRound },
  { id: "ADMIN" as const, label: "Administración", description: "Gestión integral de ORBIT.", icon: ShieldCheck },
];

export function UnifiedAccess({ initialMessage, initialAccess = "ADMIN" }: { initialMessage?: string; initialAccess?: AccessType }) {
  const [selected, setSelected] = useState<AccessType>(initialAccess);
  return <div>
    <div aria-label="Tipo de acceso" className="grid grid-cols-3 gap-2" role="tablist">
      {options.map(({ id, label, description, icon: Icon }) => <button aria-selected={selected === id} className={`min-h-24 rounded-2xl border p-3 text-left transition sm:min-h-28 sm:p-4 ${selected === id ? "border-brand/45 bg-brand/10" : "bg-background/35 hover:border-foreground/20"}`} key={id} onClick={() => setSelected(id)} role="tab">
        <Icon className={`size-5 ${selected === id ? "text-brand" : "text-muted"}`} />
        <span className="mt-3 block text-xs font-semibold sm:text-sm">{label}</span>
        <span className="mt-1 hidden text-xs leading-5 text-muted sm:block">{description}</span>
      </button>)}
    </div>
    <div className="mt-7" role="tabpanel">
      {selected === "CUSTOMER" ? <PortalLoginForm embedded type="CUSTOMER" /> : selected === "STAFF" ? <PortalLoginForm embedded type="STAFF" /> : <div>
        <div className="mb-6 text-center"><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Acceso administrativo</p><h2 className="mt-2 text-2xl font-semibold">Administración</h2><p className="mt-2 text-sm text-muted">Ingresa con tu correo y contraseña.</p></div>
        <LoginForm initialMessage={initialMessage} />
      </div>}
    </div>
  </div>;
}
