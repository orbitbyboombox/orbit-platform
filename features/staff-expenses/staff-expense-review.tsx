"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MobileDialog } from "@/components/ui/mobile-dialog";
import {
  reviewStaffExpenseAction,
  staffExpenseReceiptUrlAction,
} from "./staff-expense-review.actions";

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export type StaffExpenseReviewItem = {
  id: string;
  project_id: string;
  project_name: string;
  orbit_event_id: string;
  category: string;
  amount: number;
  occurred_on: string;
  payment_method: string | null;
  description: string | null;
  notes: string | null;
  receipt_path: string;
  status: string;
  reimbursement: boolean;
  submitted_at: string;
  rejection_reason: string | null;
  materialized_expense_id: string | null;
  assignment_count: number;
  assignment_status: string | null;
  settlement_id: string | null;
  settlement_status: string | null;
  staff: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
};

export function StaffExpenseReview({ project, items, focusId, embedded = false }: {
  project?: { id: string; name: string; orbit_event_id: string };
  items: StaffExpenseReviewItem[];
  focusId?: string;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [rejecting, setRejecting] = useState<StaffExpenseReviewItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    if (focusId && focusId !== "all") document.getElementById(`expense-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId]);

  const review = (item: StaffExpenseReviewItem, action: "APPROVE" | "REJECT", reason: string) => {
    const form = new FormData();
    form.set("submissionId", item.id);
    form.set("projectId", item.project_id);
    form.set("action", action);
    form.set("reason", reason);
    setPendingId(item.id);
    setMessage(action === "APPROVE" ? "Validando asociación y destino de reembolso…" : "Registrando rechazo…");
    startTransition(async () => {
      const result = await reviewStaffExpenseAction(form);
      setMessage(result.message);
      setPendingId(null);
      if (result.ok) {
        setRejecting(null);
        setRejectionReason("");
        router.refresh();
      }
    });
  };

  const receipt = (path: string) => startTransition(async () => {
    const result = await staffExpenseReceiptUrlAction(path);
    if (result.ok && result.url) window.open(result.url, "_blank", "noopener,noreferrer");
    else setMessage(result.message ?? "No fue posible abrir el comprobante.");
  });

  const content = <>
    {!embedded ? <header><p className="text-xs font-semibold uppercase tracking-widest text-brand">{project ? `Evento · ${project.orbit_event_id}` : "Staff · Founder/Admin"}</p><h1 className="mt-2 text-3xl font-semibold">Gastos Staff pendientes</h1><p className="mt-2 text-sm text-muted">{project ? `${project.name}. Solo la aprobación materializa un costo operacional.` : "Solo la aprobación materializa el reembolso en la liquidación canónica."}</p></header> : null}
    {message ? <p aria-live="polite" className="mt-4 rounded-xl border p-3 text-sm">{message}</p> : null}
    <div className={embedded ? "space-y-3" : "mt-6 space-y-3"}>
      {items.map((item) => {
        const staff = Array.isArray(item.staff) ? item.staff[0] : item.staff;
        const associationReady = item.assignment_count > 0 && (!item.reimbursement || Boolean(item.settlement_id));
        return <article className={`min-w-0 rounded-2xl border bg-card p-4 sm:p-5 ${item.id === focusId ? "border-brand ring-2 ring-brand/20" : ""}`} id={`expense-${item.id}`} key={item.id}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{staff ? `${staff.first_name} ${staff.last_name}` : "Staff"} · {item.category}</p><p className="mt-1 text-xs font-semibold text-brand">{item.orbit_event_id || "Evento"} · {item.project_name}</p><p className="break-words text-sm text-muted">{item.occurred_on} · {item.description || "Sin descripción"} · {item.reimbursement ? "Reembolso Staff" : "Pagado por empresa"}</p>{item.notes ? <p className="mt-1 break-words text-xs text-muted">{item.notes}</p> : null}</div><strong>{money.format(Number(item.amount))}</strong></div>
          <p className="mt-2 text-sm">Estado: {item.status}{item.rejection_reason ? ` · ${item.rejection_reason}` : ""}</p>
          <div className={`mt-3 rounded-xl border p-3 text-xs ${associationReady ? "bg-success/5 text-muted" : "border-warning/40 bg-warning/5 text-warning"}`}><p className="font-semibold text-foreground">Asociación operacional</p><p className="mt-1 break-words">Evento {item.orbit_event_id} · {item.assignment_count} {item.assignment_count === 1 ? "asignación" : "asignaciones"} {item.assignment_status ?? "NO ENCONTRADAS"}</p><p className="mt-1 break-words">Destino de reembolso: {item.reimbursement ? (item.settlement_status ? "Liquidación Staff CONFIRMADA" : "NO RESUELTO") : "No requerido"}</p>{!associationReady ? <p className="mt-2 font-semibold">No se puede aprobar hasta corregir la asociación canónica del Evento y Staff.</p> : null}</div>
          <Button className="mt-3" disabled={pending} onClick={() => receipt(item.receipt_path)} type="button" variant="outline">Ver comprobante</Button>
          {item.status === "PENDING_REVIEW" ? <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap"><Button className="min-h-11 w-full sm:w-auto" disabled={pending||!associationReady} loading={pending && pendingId === item.id} loadingLabel="Procesando…" onClick={() => review(item, "APPROVE", "Aprobación Founder/Admin")} type="button">APROBAR</Button><Button className="min-h-11 w-full sm:w-auto" disabled={pending} onClick={() => setRejecting(item)} type="button" variant="outline">RECHAZAR</Button></div> : null}
        </article>;
      })}
      {!items.length ? <p className="rounded-2xl border border-dashed p-8 text-center text-muted">No hay gastos Staff pendientes de revisión.</p> : null}
    </div>
    {rejecting ? <MobileDialog description={`${rejecting.orbit_event_id} · ${rejecting.project_name}`} eyebrow="Revisión Founder/Admin" onClose={() => !pending && setRejecting(null)} title="Rechazar gasto Staff"><form action={() => review(rejecting, "REJECT", rejectionReason.trim())} className="space-y-4"><label className="block text-sm font-medium">Motivo del rechazo *<textarea className="mt-2 min-h-28 w-full rounded-xl border bg-background px-3 py-2" onChange={(event) => setRejectionReason(event.target.value)} required value={rejectionReason} /></label><Button className="w-full" disabled={!rejectionReason.trim()} loading={pending && pendingId === rejecting.id} loadingLabel="Registrando rechazo…" type="submit" variant="destructive">CONFIRMAR RECHAZO</Button></form></MobileDialog> : null}
  </>;

  if (embedded) return <div aria-busy={pending}>{content}</div>;
  return <main className="mx-auto max-w-5xl p-4 sm:p-8">{content}</main>;
}
