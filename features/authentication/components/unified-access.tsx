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
  return <div className="bbox-access-content">
    <div aria-label="Tipo de acceso" className="bbox-access-tabs" role="tablist">
      {options.map(({ id, label }) => <button aria-selected={selected === id} className={selected === id ? "active" : ""} key={id} onClick={() => setSelected(id)} role="tab">
        {label}
      </button>)}
    </div>
    <div className="bbox-access-panel orbit-enter" key={selected} role="tabpanel">
      {selected === "CUSTOMER" ? <PortalLoginForm embedded type="CUSTOMER" /> : selected === "STAFF" ? <PortalLoginForm embedded type="STAFF" /> : <div>
        <div className="bbox-access-heading"><p>ACCESO ADMINISTRATIVO</p><h2>Bienvenido</h2><span>Ingresa para gestionar la operación de BOOMBOX.</span></div>
        <LoginForm initialMessage={initialMessage} />
      </div>}
    </div>
  </div>;
}
