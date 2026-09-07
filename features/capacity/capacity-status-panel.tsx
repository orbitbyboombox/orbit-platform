"use client";

import { CheckCircle2, CircleAlert, CircleX, LoaderCircle } from "lucide-react";

export type CapacityResult = {
  status: "AVAILABLE" | "UNAVAILABLE" | "REVIEW_REQUIRED";
  humanSafeReason?: string;
  caseCapacity?: { total?: number; committed?: number; available?: number };
  bboxCapacity?: { total?: number; committed?: number; available?: number };
  shell?: { preferred?: string | null; status?: string };
};

export function CapacityStatusPanel({ result, loading = false, missingInputs = false, missingMessage, validatedAt }: { result?: CapacityResult | null; loading?: boolean; missingInputs?: boolean; missingMessage?: string; validatedAt?: string }) {
  const state = loading ? "LOADING" : missingInputs ? "MISSING" : result?.status ?? "REVIEW_REQUIRED";
  const copy = state === "AVAILABLE" ? { title: "DISPONIBLE ✓", tone: "success" } : state === "UNAVAILABLE" ? { title: "SIN DISPONIBILIDAD", tone: "danger" } : state === "MISSING" ? { title: "Completa fecha, horario y ubicación", tone: "neutral" } : state === "LOADING" ? { title: "VALIDANDO DISPONIBILIDAD…", tone: "neutral" } : { title: "REQUIERE REVISIÓN", tone: "warning" };
  const Icon = state === "AVAILABLE" ? CheckCircle2 : state === "UNAVAILABLE" ? CircleX : state === "LOADING" ? LoaderCircle : CircleAlert;
  const capacity = result?.caseCapacity;
  const bbox = result?.bboxCapacity;
  return <section aria-label="Disponibilidad" className={`rounded-2xl border p-4 ${copy.tone === "success" ? "border-success/30 bg-success-soft" : copy.tone === "danger" ? "border-danger/30 bg-danger-soft" : copy.tone === "warning" ? "border-warning/30 bg-warning-soft" : "bg-card"}`}>
    <div className="flex items-start gap-3"><Icon className={`mt-0.5 size-5 shrink-0 ${state === "LOADING" ? "animate-spin" : ""}`} /><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-muted">Disponibilidad</p><h3 className="mt-1 text-lg font-semibold">{copy.title}</h3><p className="mt-1 text-sm leading-5 text-muted">{result?.humanSafeReason ?? (state === "MISSING" ? (missingMessage ?? "Completa fecha, horario y ubicación para validar capacidad.") : state === "LOADING" ? "La cotización continúa disponible mientras validamos." : "No fue posible validar disponibilidad. Requiere revisión.")}</p></div></div>
    {capacity ? <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-xs text-muted">CASE</p><strong>{capacity.committed ?? 0} / {capacity.total ?? 0} comprometidos</strong><p className="text-xs text-muted">{capacity.available ?? 0} disponibles</p></div>{bbox ? <div><p className="text-xs text-muted">BBOX360</p><strong>{bbox.committed ?? 0} / {bbox.total ?? 0} comprometidos</strong><p className="text-xs text-muted">{bbox.available ?? 0} disponibles</p></div> : null}<div><p className="text-xs text-muted">Configuración</p><strong>{result?.shell?.preferred ?? "Por revisar"}</strong><p className="text-xs text-muted">{result?.shell?.status === "REVIEW" ? "Revisión operacional" : "Según contrato"}</p></div></div> : null}
    {validatedAt ? <p className="mt-3 text-[11px] text-muted">Validado: {validatedAt}</p> : null}
  </section>;
}
