"use client";

import { useState, useTransition } from "react";
import { submitStaffComplementaryBoletaAction } from "./staff-portal.actions";

export type StaffPortalComplementarySettlement = {
  id: string;
  eventName: string;
  eventDate: string;
  amount: number;
  status: string;
  boletaIssueDate: string | null;
};

const money = (value: number) => new Intl.NumberFormat("es-CL", {
  style: "currency", currency: "CLP", maximumFractionDigits: 0,
}).format(value);

export function StaffComplementaryBoletaPanel({ settlements }: { settlements: StaffPortalComplementarySettlement[] }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  if (!settlements.length) return null;
  return <section className="rounded-3xl border border-brand/30 bg-brand/5 p-4 sm:p-5" aria-label="Liquidaciones complementarias">
    <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">LIQUIDACIONES COMPLEMENTARIAS</p>
    <h3 className="mt-1 text-xl font-semibold">Boletas pendientes de eventos adicionales</h3>
    <p className="mt-1 text-sm text-muted">Estas liquidaciones son independientes de tus cierres mensuales anteriores. No registran pagos automáticamente.</p>
    <div className="mt-4 space-y-3">
      {settlements.map((item) => <article className="rounded-2xl border bg-background p-4" key={item.id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-semibold">{item.eventName}</p><p className="mt-1 text-sm text-muted">{item.eventDate} · {money(item.amount)}</p></div>
          <span className="rounded-full border border-amber-400/30 px-2.5 py-1 text-xs font-semibold text-amber-300">{item.status === "BOLETA_REJECTED" ? "REQUIERE CORRECCIÓN" : item.status === "PENDING" ? "BOLETA PENDIENTE" : item.status}</span>
        </div>
        {item.status === "PENDING" || item.status === "BOLETA_REJECTED" ? <form action={(form) => start(async () => setMessage((await submitStaffComplementaryBoletaAction(form)).message))} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input name="settlementId" type="hidden" value={item.id} />
          <label className="text-xs font-medium text-muted">Fecha de emisión<input className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm" name="issueDate" required type="date" /></label>
          <label className="text-xs font-medium text-muted">Segunda boleta<input accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-1 block min-h-11 w-full rounded-xl border bg-background p-2 text-sm" name="file" required type="file" /></label>
          <button className="min-h-11 self-end rounded-xl bg-brand px-4 font-semibold text-brand-foreground disabled:opacity-50" disabled={pending}>{pending ? "Enviando…" : "Enviar boleta"}</button>
        </form> : <p className="mt-3 text-sm text-muted">La boleta ya fue recibida y está en revisión administrativa.</p>}
      </article>)}
    </div>
    {message ? <p className="mt-3 rounded-xl border bg-background p-3 text-sm" role="status">{message}</p> : null}
  </section>;
}
