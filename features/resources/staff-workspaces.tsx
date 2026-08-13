"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarRange,
  CircleDollarSign,
  GraduationCap,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

type Workspace = "TEAM" | "OPERATIONS" | "PORTAL" | "PAYROLL" | "ACADEMY";

const workspaces = [
  { key: "TEAM" as const, label: "Equipo", icon: UsersRound },
  { key: "OPERATIONS" as const, label: "Operaciones", icon: CalendarRange },
  { key: "PORTAL" as const, label: "Portal Staff", icon: ShieldCheck },
  { key: "PAYROLL" as const, label: "Nómina Mensual", icon: CircleDollarSign },
  { key: "ACADEMY" as const, label: "Academy Manager", icon: GraduationCap },
];

export function StaffWorkspaces({
  team,
  operations,
  portal,
  payroll,
  academy,
}: {
  team: ReactNode;
  operations: ReactNode;
  portal: ReactNode;
  payroll: ReactNode;
  academy: ReactNode;
}) {
  const [active, setActive] = useState<Workspace>("TEAM");
  const content = {
    TEAM: team,
    OPERATIONS: operations,
    PORTAL: portal,
    PAYROLL: payroll,
    ACADEMY: academy,
  }[active];
  return (
    <section className="space-y-6">
      <header className="rounded-2xl border bg-card p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
          Staff · Centro de ejecución BOOMBOX
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Operación de Staff</h1>
        <nav
          aria-label="Espacios operacionales de Staff"
          className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5"
        >
          {workspaces.map(({ key, label, icon: Icon }) => (
            <button
              aria-current={active === key ? "page" : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 text-left text-sm font-semibold ${active === key ? "border-brand bg-brand/10 text-brand" : "bg-background hover:bg-accent"}`}
              key={key}
              onClick={() => setActive(key)}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
      </header>
      {content}
    </section>
  );
}
