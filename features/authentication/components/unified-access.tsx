"use client";

import { useState } from "react";
import { LoginForm } from "./login-form";
import { PortalLoginForm } from "@/features/portal-authentication/portal-login-form";

export type AccessType = "CUSTOMER" | "STAFF" | "ADMIN";
const options = [
  { id: "CUSTOMER" as const, label: "CLIENTES" },
  { id: "STAFF" as const, label: "STAFF" },
  { id: "ADMIN" as const, label: "ADMINISTRADOR" },
];

export function UnifiedAccess({ initialMessage, initialAccess = "ADMIN" }: { initialMessage?: string; initialAccess?: AccessType }) {
  const [selected, setSelected] = useState<AccessType>(initialAccess);
  return <div>
    <div aria-label="Tipo de acceso" className="grid grid-cols-3 rounded-xl border bg-background/45 p-1" role="tablist">
      {options.map(({ id, label }) => <button aria-selected={selected === id} className={`min-h-11 rounded-lg px-2 text-[10px] font-semibold tracking-[.04em] transition-colors sm:text-xs ${selected === id ? "bg-card text-brand shadow-sm" : "text-muted hover:text-foreground"}`} key={id} onClick={() => setSelected(id)} role="tab">
        {label}
      </button>)}
    </div>
    <div className="orbit-enter mt-4" key={selected} role="tabpanel">
      {selected === "CUSTOMER" ? <PortalLoginForm embedded type="CUSTOMER" /> : selected === "STAFF" ? <PortalLoginForm embedded type="STAFF" /> : <div>
        <div className="mb-4 text-center"><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Acceso administrativo</p><h2 className="mt-1 text-2xl font-semibold">Administración</h2><p className="mt-1 text-sm text-muted">Control total de BOOMBOX desde un solo lugar.</p></div>
        <LoginForm initialMessage={initialMessage} />
      </div>}
    </div>
  </div>;
}
