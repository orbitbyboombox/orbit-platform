"use client";

import { useState } from "react";
import { LoginForm } from "./login-form";
import { PortalLoginForm } from "@/features/portal-authentication/portal-login-form";

export type AccessType = "CUSTOMER" | "STAFF" | "ADMIN";
const options = [
  { id: "CUSTOMER" as const, label: "CLIENTES" },
  { id: "STAFF" as const, label: "STAFF" },
  { id: "ADMIN" as const, label: "ADMINISTRACIÓN" },
];

export function UnifiedAccess({ initialMessage, initialAccess = "ADMIN" }: { initialMessage?: string; initialAccess?: AccessType }) {
  const [selected, setSelected] = useState<AccessType>(initialAccess);
  return <div>
    <div aria-label="Tipo de acceso" className="access-tabs" role="tablist">
      {options.map(({ id, label }) => <button aria-selected={selected === id} className={selected === id ? "active" : ""} key={id} onClick={() => setSelected(id)} role="tab">
        {label}
      </button>)}
    </div>
    <div className="access-tab-panel" key={selected} role="tabpanel">
      {selected === "CUSTOMER" ? <PortalLoginForm embedded type="CUSTOMER" /> : selected === "STAFF" ? <PortalLoginForm embedded type="STAFF" /> : <div>
        <div className="access-heading"><span>ACCESO ADMINISTRATIVO</span><h1>Bienvenido</h1><p>Ingresa para gestionar la operación de BOOMBOX.</p></div>
        <LoginForm initialMessage={initialMessage} />
      </div>}
    </div>
  </div>;
}
