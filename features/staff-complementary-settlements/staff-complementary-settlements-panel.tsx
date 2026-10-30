"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createComplementarySettlementAction,
  registerComplementaryPaymentAction,
  reviewComplementaryBoletaAction,
  submitComplementaryBoletaAction,
} from "./actions";

export type ComplementarySettlement = {
  id: string;
  staffId: string;
  settlementId: string;
  eventName: string;
  staffName: string;
  eventDate: string;
  amount: number;
  status: string;
  boletaIssueDate: string | null;
};

export type ComplementaryCandidate = {
  id: string;
  eventName: string;
  staffName: string;
  eventDate: string;
  amount: number;
};

const money = (value: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);

export function StaffComplementarySettlementsPanel({
  settlements,
  candidates,
}: {
  settlements: ComplementarySettlement[];
  candidates: ComplementaryCandidate[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const run = (action: (form: FormData) => Promise<{ ok: boolean; message: string }>) =>
    (form: FormData) => start(async () => {
      const result = await action(form);
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  return (
    <section className="rounded-2xl border border-brand/30 bg-brand/5 p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Liquidaciones complementarias</p>
      <h3 className="mt-1 text-lg font-semibold">Eventos posteriores a un cierre mensual</h3>
      <p className="mt-1 text-sm text-muted">
        Son independientes del cierre original: no reabren el mes, no modifican pagos históricos y solo se pagan después de aprobar la segunda boleta.
      </p>
      {candidates.length ? (
        <div className="mt-4 space-y-2">
          {candidates.map((candidate) => (
            <form action={run(createComplementarySettlementAction)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3" key={candidate.id}>
              <div>
                <p className="font-medium">{candidate.eventName}</p><p className="text-sm text-brand">Operador: {candidate.staffName}</p>
                <p className="text-xs text-muted">{candidate.eventDate} · Monto calculado {money(candidate.amount)}</p>
              </div>
              <input name="settlementId" type="hidden" value={candidate.id} />
              <input className="min-h-10 rounded-lg border px-2 text-sm" name="reason" placeholder="Motivo" required />
              <Button disabled={pending} type="submit">Crear complementaria</Button>
            </form>
          ))}
        </div>
      ) : null}
      {settlements.length ? (
        <div className="mt-4 space-y-3">
          {settlements.map((item) => (
            <article className="rounded-xl border bg-background p-4" key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold">{item.eventName}</p><p className="text-sm text-brand">Operador: {item.staffName}</p><p className="text-sm text-muted">{item.eventDate} · {money(item.amount)}</p></div>
                <strong className="text-brand">{item.status}</strong>
              </div>
              {item.status === "PENDING" || item.status === "BOLETA_REJECTED" ? (
                <form action={run(submitComplementaryBoletaAction)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input name="settlementId" type="hidden" value={item.id} />
                  <label className="text-xs text-muted">Fecha de emisión<input className="mt-1 min-h-10 w-full rounded-lg border px-2 text-sm" name="issueDate" required type="date" /></label>
                  <label className="text-xs text-muted">Segunda boleta<input accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-1 block min-h-10 w-full text-sm" name="file" required type="file" /></label>
                  <Button className="self-end" disabled={pending} type="submit">Recibir boleta</Button>
                </form>
              ) : null}
              {item.status === "BOLETA_RECEIVED" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={run(reviewComplementaryBoletaAction)}><input name="settlementId" type="hidden" value={item.id} /><input name="action" type="hidden" value="APPROVE" /><Button disabled={pending} type="submit">Aprobar boleta</Button></form>
                  <form action={run(reviewComplementaryBoletaAction)}><input name="settlementId" type="hidden" value={item.id} /><input name="action" type="hidden" value="REJECT" /><input name="reason" placeholder="Motivo de rechazo" required /><Button disabled={pending} type="submit" variant="outline">Rechazar</Button></form>
                </div>
              ) : null}
              {item.status === "READY_TO_PAY" ? (
                <form action={run(registerComplementaryPaymentAction)} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <input name="settlementId" type="hidden" value={item.id} /><input name="amount" type="hidden" value={item.amount} />
                  <label className="text-xs text-muted">Fecha de pago<input className="mt-1 min-h-10 w-full rounded-lg border px-2" name="paymentDate" required type="date" /></label>
                  <label className="text-xs text-muted">Método<input className="mt-1 min-h-10 w-full rounded-lg border px-2" name="method" required /></label>
                  <label className="text-xs text-muted">Referencia<input className="mt-1 min-h-10 w-full rounded-lg border px-2" name="reference" /></label>
                  <label className="text-xs text-muted">Comprobante<input accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-1 block min-h-10 w-full text-sm" name="file" required type="file" /></label>
                  <Button className="self-end" disabled={pending} type="submit">Registrar pago</Button>
                </form>
              ) : null}
              {item.status === "PAID" ? <p className="mt-3 text-sm">Pago registrado. El cierre mensual original permanece intacto.</p> : null}
            </article>
          ))}
        </div>
      ) : <p className="mt-4 text-sm text-muted">No hay liquidaciones complementarias creadas.</p>}
      {message ? <p aria-live="polite" className="mt-3 text-sm text-muted">{message}</p> : null}
    </section>
  );
}
