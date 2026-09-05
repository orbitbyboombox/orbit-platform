"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markEventCompletedAction } from "./actions";

export function EventCompletionAction({ projectId, status }: { projectId: string; status: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  if (["COMPLETED", "Completed", "ARCHIVED", "Archived", "CANCELLED", "Cancelled"].includes(status)) return null;
  return <section className="mt-6 rounded-xl border border-brand/25 bg-brand/5 p-4 sm:p-5"><p className="font-semibold">¿El servicio ya fue realizado?</p><p className="mt-1 text-sm text-muted">El saldo del cliente, cobranzas y pagos pendientes continuarán activos de forma independiente.</p><Button className="mt-3 min-h-11" disabled={pending} onClick={() => { if (window.confirm("¿Confirmas que este evento fue realizado y está operacionalmente completado?")) start(() => markEventCompletedAction(projectId).then(result => setMessage(result.ok ? result.message ?? "Actualizado." : result.error ?? "No fue posible completar el Evento."))); }} variant="outline">Marcar como completado</Button>{message && <p aria-live="polite" className="mt-3 text-sm text-muted">{message}</p>}</section>;
}
