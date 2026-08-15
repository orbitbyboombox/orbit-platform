"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewStaffRequestAction, setStaffEventPublicationAction } from "@/features/operations/operations-planning.actions";

export type StaffOperationsEvent = {
  id: string;
  date: string;
  customer: string;
  service: string;
  published: boolean;
  ready: boolean;
  assignments: string[];
  settlements?: Array<{
    id: string;
    staff: string;
    net: number;
    paid: number;
    status: string;
  }>;
  eventStatus?: string;
  requestCount?: number;
  readinessPending?: number;
};
export type StaffOperationsRequest = {
  id: string;
  staff: string;
  event: string;
  date: string;
  responsibility: string;
  projectId: string;
};

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
const closedStates = new Set([
  "COMPLETED",
  "COMPLETED_EVENT",
  "CLOSED",
  "ARCHIVED",
  "CANCELLED",
  "Completed",
  "Archived",
  "Cancelled",
]);
const state = (event: StaffOperationsEvent) =>
  closedStates.has(event.eventStatus ?? "")
    ? "CLOSED"
    : event.published
      ? "PUBLISHED"
      : event.ready
        ? "READY"
        : "DRAFT";
const statePresentation = {
  DRAFT: { label: "Borrador", style: "bg-accent text-muted" },
  READY: { label: "Listo", style: "bg-info-soft text-info" },
  PUBLISHED: { label: "Publicado", style: "bg-success-soft text-success" },
  CLOSED: { label: "Cerrado", style: "bg-danger-soft text-danger" },
} as const;

export function StaffOperationsView({
  events,
  requests,
}: {
  events: StaffOperationsEvent[];
  requests: StaffOperationsRequest[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const publication = (event: StaffOperationsEvent, published: boolean) =>
    start(async () => {
      setPendingId(event.id);
      const data = new FormData();
      data.set("projectId", event.id);
      data.set("published", String(published));
      const result = await setStaffEventPublicationAction(data);
      setPendingId(null);
      if (!result.ok) window.alert(result.message);
      else router.refresh();
    });
  const review = (requestId: string, decision: "approve" | "reject") =>
    start(async () => {
      setPendingId(requestId);
      const data = new FormData();
      data.set("requestId", requestId);
      data.set("decision", decision);
      const result = await reviewStaffRequestAction(data);
      setPendingId(null);
      if (!result.ok) window.alert(result.message);
      else router.refresh();
    });

  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5 sm:p-7">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
          Operaciones · próximos 15 días
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Control de publicación Staff</h2>
        <p className="mt-2 text-sm text-muted">
          Prepara y revisa cada Evento internamente. El Portal Staff sólo lo muestra después de una activación explícita.
        </p>
      </header>
      <div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
        <section>
          <h3 className="font-semibold">Próximos Eventos</h3>
          <div className="mt-3 space-y-3">
            {events.map((event) => {
              const current = state(event);
              const presentation = statePresentation[current];
              const changing = pending && pendingId === event.id;
              return (
                <article className="rounded-xl border p-4" key={event.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{event.date} · {event.customer}</p>
                      <p className="mt-1 text-sm text-muted">{event.service}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${presentation.style}`}>
                      {presentation.label}
                    </span>
                  </div>
                  <p className="mt-3 text-sm">
                    {event.assignments.length
                      ? event.assignments.join(" · ")
                      : "Sin asignaciones confirmadas"}
                  </p>
                  <p className={`mt-2 text-xs font-semibold ${event.readinessPending ? "text-warning" : "text-success"}`}>
                    {event.readinessPending ? `OPERACIÓN: ${event.readinessPending} PENDIENTES` : "OPERACIÓN LISTA"}
                  </p>
                  {event.settlements?.length ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {event.settlements.map((item) => (
                        <div className="rounded-lg bg-background/60 p-3 text-xs" key={item.id}>
                          <p className="font-semibold">{item.staff}</p>
                          <p className="mt-1 text-muted">
                            Neto Evento: {money(item.net)} · Pagado: {money(item.paid)} · Saldo: {money(Math.max(0, item.net - item.paid))}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center gap-4 border-t pt-4">
                    {current === "READY" ? (
                      <button className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground" disabled={pending} onClick={() => publication(event, true)}>
                        {changing ? "Activando…" : "Activar para Staff"}
                      </button>
                    ) : null}
                    {current === "PUBLISHED" ? (
                      <>
                        <span className="text-sm font-semibold text-success">Publicado en Portal Staff</span>
                        <button className="rounded-lg border px-3 py-2 text-sm font-semibold text-muted hover:text-foreground" disabled={pending} onClick={() => publication(event, false)}>
                          {changing ? "Desactivando…" : "Desactivar publicación"}
                        </button>
                      </>
                    ) : null}
                    {current === "DRAFT" ? <span className="text-sm text-muted">Completa la configuración antes de activar.</span> : null}
                    {current === "CLOSED" ? <span className="text-sm text-danger">No acepta nuevas solicitudes.</span> : null}
                    <Link className="py-2 text-sm font-semibold text-brand" href={`/projects/${event.id}#staff-assignment`}>
                      Abrir Evento
                    </Link>
                  </div>
                </article>
              );
            })}
            {!events.length ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted">No hay eventos durante los próximos 15 días.</p> : null}
          </div>
        </section>
        <section>
          <h3 className="font-semibold">Solicitudes pendientes</h3>
          <div className="mt-3 space-y-3">
            {requests.map((request) => (
              <article className="rounded-xl border p-4" key={request.id}>
                <p className="font-semibold">{request.staff} · {request.responsibility}</p>
                <p className="mt-1 text-sm text-muted">{request.event} · {request.date}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50" disabled={pending} onClick={() => review(request.id, "approve")}>
                    {pending && pendingId === request.id ? "Procesando…" : "Aprobar"}
                  </button>
                  <button className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={pending} onClick={() => review(request.id, "reject")}>
                    Rechazar
                  </button>
                  <Link className="px-2 py-2 text-sm font-semibold text-brand" href={`/projects/${request.projectId}`}>
                    Ver Evento
                  </Link>
                </div>
              </article>
            ))}
            {!requests.length ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted">No hay solicitudes pendientes.</p> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
