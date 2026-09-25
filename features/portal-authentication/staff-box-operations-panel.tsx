"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { loadStaffBoxOperationsAction, recordStaffBoxCheckInAction, recordStaffBoxCheckOutAction, type StaffBoxAssignment } from "./staff-box-operations.actions";

const statuses = ["OK", "MISSING", "DAMAGED", "MAINTENANCE_REQUIRED"] as const;

export function StaffBoxOperationsPanel({ projectId }: { projectId: string }) {
  const [state, setState] = useState<{ assignment: StaffBoxAssignment; roles: string[] } | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [componentStates, setComponentStates] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState("");
  const [note, setNote] = useState("");
  const [incident, setIncident] = useState(false);
  const load = () => startTransition(async () => { const result = await loadStaffBoxOperationsAction(projectId); if (result.ok) setState({ assignment: result.assignment, roles: result.roles }); else setMessage(result.message); });
  useEffect(() => { load(); }, [projectId]);
  const components = state?.assignment.components ?? [];
  const payload = useMemo(() => components.map((component) => ({ componentId: component.id, status: componentStates[component.id] ?? "OK", incident: (componentStates[component.id] ?? "OK") !== "OK" })), [components, componentStates]);
  if (!state?.assignment.id) return null;
  const canCheckout = state.roles.some((role) => ["OPERATOR", "ASSEMBLY"].includes(role));
  const canCheckin = state.roles.some((role) => ["OPERATOR", "DISASSEMBLY"].includes(role));
  return <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-label="Operación de Caja Staff"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Caja asignada</p><h3 className="mt-1 text-xl font-semibold">{state.assignment.boxCode}</h3><p className="mt-1 text-sm text-muted">{state.assignment.format ?? "Formato no cargado"} · {state.assignment.lot ?? "Lote no cargado"} · {state.assignment.mediaRemaining ?? "—"} fotos restantes</p></div><span className="rounded-full border px-3 py-1 text-xs">{state.assignment.boxStatus}</span></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{components.map((component) => <label className="rounded-xl border p-3 text-sm" key={component.id}><span className="font-medium">{component.code}</span><select aria-label={`Estado ${component.code}`} className="mt-2 min-h-10 w-full rounded-lg border bg-background px-2" value={componentStates[component.id] ?? "OK"} onChange={(event) => setComponentStates((current) => ({ ...current, [component.id]: event.target.value }))}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>)}</div><div className="mt-4 flex flex-wrap gap-2">{canCheckout ? <button type="button" className="min-h-11 rounded-xl border px-4 text-sm font-semibold" disabled={pending} onClick={() => startTransition(async () => { const result = await recordStaffBoxCheckOutAction({ projectId, assignmentId: state.assignment.id, components: payload }); setMessage(result.ok ? "CHECK_OUT registrado." : result.message); })}>CHECK_OUT — confirmar salida</button> : null}{canCheckin && state.assignment.mediaLotId ? <div className="flex flex-wrap items-end gap-2"><label className="text-sm font-medium">Fotos al retorno<input className="mt-1 min-h-11 w-32 rounded-xl border bg-background px-3" type="number" min="0" value={remaining} onChange={(event) => setRemaining(event.target.value)} placeholder={String(state.assignment.mediaRemaining ?? 0)} /></label><button type="button" className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background" disabled={pending || remaining === ""} onClick={() => startTransition(async () => { const result = await recordStaffBoxCheckInAction({ projectId, assignmentId: state.assignment.id, mediaLotId: state.assignment.mediaLotId!, remaining: Number(remaining), components: payload, note, incident, }); setMessage(result.ok ? "CHECK_IN registrado." : result.message); })}>CHECK_IN — registrar retorno</button></div> : null}</div><textarea className="mt-3 min-h-20 w-full rounded-xl border bg-background p-3 text-sm" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nota operacional / incidente (opcional)" /><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={incident} onChange={(event) => setIncident(event.target.checked)} /> Marcar incidente para revisión</label>{message ? <p aria-live="polite" className="mt-3 text-sm text-muted">{message}</p> : null}</section>;
}
