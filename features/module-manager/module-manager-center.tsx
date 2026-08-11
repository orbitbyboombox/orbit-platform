"use client";

import { useState, useTransition } from "react";
import { Power, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  categoryLabels,
  moduleCategories,
  ORBIT_MODULE_CATALOG,
  type OrbitModuleKey,
} from "./catalog";
import type { ModuleStateMap } from "./repository";
import { setOrbitModuleStateAction } from "./actions";

export function ModuleManagerCenter({
  initialStates,
}: {
  initialStates: ModuleStateMap;
}) {
  const router = useRouter();
  const [states, setStates] = useState(initialStates);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const toggle = (key: OrbitModuleKey, name: string) => {
    const enabled = !states[key];
    const reason = window.prompt(
      `Razón para ${enabled ? "activar" : "desactivar"} ${name}:`,
    );
    if (!reason) return;
    startTransition(async () => {
      const result = await setOrbitModuleStateAction({ key, enabled, reason });
      if (!result.ok) return setMessage(result.error);
      setStates((current) => ({ ...current, [key]: enabled }));
      router.refresh();
      setMessage(
        `${name} ${enabled ? "activado" : "desactivado"}. Los accesos se actualizaron inmediatamente.`,
      );
    });
  };
  return (
    <section className="scroll-mt-24 space-y-7" id="module-manager">
      <header className="rounded-3xl border bg-card p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <span className="rounded-2xl border bg-background p-3 text-brand">
            <Power className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
              Settings
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              ORBIT Module Manager
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Activa o desactiva la visibilidad y disponibilidad de cada área.
              Ningún dato ni código se elimina.
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-xl border bg-background/40 p-3 text-xs text-muted">
          <ShieldCheck className="size-4 text-success" />
          Cambios persistentes, inmediatos y auditados.
        </div>
      </header>
      {message && (
        <p className="rounded-xl border bg-card p-3 text-sm" role="status">
          {message}
        </p>
      )}
      {moduleCategories.map((category) => (
        <section className="space-y-3" key={category}>
          <h3 className="text-sm font-semibold uppercase tracking-[.16em] text-muted">
            {categoryLabels[category]}
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {ORBIT_MODULE_CATALOG.filter(
              (item) => item.category === category,
            ).map((item) => {
              const Icon = item.icon;
              const enabled = states[item.key] !== false;
              return (
                <article
                  className="flex items-center gap-4 rounded-2xl border bg-card p-4 sm:p-5"
                  key={item.key}
                >
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-xl border ${enabled ? "text-brand" : "text-muted"}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">{item.name}</h4>
                      <StatusBadge
                        label={enabled ? "ON" : "OFF"}
                        variant={enabled ? "success" : "neutral"}
                      />
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {item.description}
                    </p>
                  </div>
                  <Button
                    aria-label={`${enabled ? "Desactivar" : "Activar"} ${item.name}`}
                    disabled={pending}
                    onClick={() => toggle(item.key, item.name)}
                    size="sm"
                    variant={enabled ? "outline" : "default"}
                  >
                    {enabled ? "Desactivar" : "Activar"}
                  </Button>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
