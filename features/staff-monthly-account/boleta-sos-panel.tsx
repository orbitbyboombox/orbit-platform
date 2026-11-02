"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { uploadBoletaSosAction } from "./boleta-sos.actions";
import type { StaffMonthlyAccount } from "./model";

const pesos = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

export function BoletaSosPanel({ account, operatorName }: { account: StaffMonthlyAccount; operatorName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  const details = account.calculation.details.filter(d => d.settlementId && d.workNet > 0);
  const [selectedId, setSelectedId] = useState("");
  const selected = details.find(d => d.settlementId === selectedId);
  return (
    <section className="rounded-xl border border-brand/30 bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-brand">BOLETA SOS</p>
          <p className="mt-1 text-xs text-muted">Boleta adicional excepcional, vinculada a un evento. No reemplaza la boleta mensual ni registra pagos.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setOpen(v => !v)}>{open ? "Cerrar" : "BOLETA SOS"}</Button>
      </div>
      {open && <form className="mt-4 space-y-3" action={form => start(async () => {
        setMessage("");
        const result = await uploadBoletaSosAction(form);
        setMessage(result.message);
        if (result.ok) { setOpen(false); router.refresh(); }
      })}>
        <p className="text-sm font-medium">{operatorName} · {account.month}</p>
        <label className="block text-sm">Evento / liquidación
          <select required name="settlementId" value={selectedId} onChange={e => setSelectedId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3">
            <option value="">Selecciona el evento</option>
            {details.map(d => <option key={d.settlementId} value={d.settlementId}>{d.eventDate} · {d.event} · {pesos(d.workNet)} netos</option>)}
          </select>
        </label>
        {selected && <p className="rounded-lg bg-card p-3 text-sm">Honorarios del evento: <strong>{pesos(selected.workNet)} líquidos</strong>. Verifica el monto pendiente antes de pagar. Reembolsos fuera de esta boleta.</p>}
        <label className="block text-sm">Fecha de emisión de la boleta
          <input required name="issueDate" type="date" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"/>
        </label>
        <label className="block text-sm">Adjuntar boleta SII (PDF o imagen, máximo 15 MB)
          <input required name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm"/>
        </label>
        <Button type="submit" disabled={pending || !selectedId || !details.length}>{pending ? "Subiendo…" : "GUARDAR BOLETA SOS"}</Button>
      </form>}
      {message && <p aria-live="polite" className="mt-2 text-sm text-muted">{message}</p>}
    </section>
  );
}
