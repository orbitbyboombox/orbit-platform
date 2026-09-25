"use client";

import { useEffect, useState } from "react";
import { loadEventBoxOperationsAction } from "./event-box-operations.actions";

export function EventBoxOperationsPanel({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadEventBoxOperationsAction>> | null>(null);
  useEffect(() => { loadEventBoxOperationsAction(projectId).then(setResult); }, [projectId]);
  if (!result || !result.ok || !result.assignments.length) return null;
  return <section className="mt-5 rounded-2xl border bg-card p-4 sm:p-6" aria-label="Operación de Caja del Evento"><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Phase C.3 · Operación</p><h3 className="mt-1 text-xl font-semibold">Caja asignada e historial operacional</h3><div className="mt-4 grid gap-3">{result.assignments.map((item) => <article className="rounded-xl border p-4" key={item.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{item.box?.asset_code ?? "Caja"}</p><p className="text-sm text-muted">{item.assignment_status} · {item.return_condition ?? "Pendiente de retorno"}</p></div><span className="text-sm">{item.box?.status}</span></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><span>CHECK_OUT: {item.inspections.filter((inspection) => inspection.inspection_type === "CHECK_OUT").length}</span><span>CHECK_IN: {item.inspections.filter((inspection) => inspection.inspection_type === "CHECK_IN").length}</span><span>Incidentes: {item.incidents.length}</span></div>{item.movements.length ? <div className="mt-3 rounded-lg bg-background/60 p-3 text-sm">{item.movements.slice(0, 3).map((movement) => <p key={movement.id}>Uso: {movement.quantity_before} → {movement.quantity_after} ({movement.quantity_delta})</p>)}</div> : null}{item.incidents.map((incident) => <p className="mt-2 text-sm text-amber-700" key={incident.id}>Incidente {incident.severity}: {incident.description}</p>)}</article>)}</div></section>;
}
