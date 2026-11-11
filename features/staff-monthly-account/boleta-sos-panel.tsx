"use client";
import {formatDisplayDate} from "@/lib/display-date";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { listBoletaSosCandidatesAction, uploadBoletaSosAction, listBoletaSosReviewAction, viewBoletaSosAction, approveBoletaSosAction, registerBoletaSosPaymentAction } from "./boleta-sos.actions";
import type { StaffMonthlyAccount } from "./model";

const pesos = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

export function BoletaSosPanel({ account, operatorName }: { account: StaffMonthlyAccount; operatorName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  const [details, setDetails] = useState<{ settlementId: string; eventDate: string; workNet: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewItems, setReviewItems] = useState<{id:string;eventDate:string;amount:number;fileName:string;paidAmount:number;status:string}[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listBoletaSosReviewAction(account.staffId, account.month.slice(0, 7)).then(result => {
      if (!cancelled) { setReviewItems(result.items); if (!result.ok) setMessage(result.message); }
    });
    listBoletaSosCandidatesAction(account.staffId, account.month.slice(0, 7)).then(result => {
      if (cancelled) return;
      setDetails(result.candidates);
      setMessage(result.ok ? "" : result.message);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, account.staffId, account.month]);
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
            <option value="">{loading ? "Consultando pendientes…" : "Selecciona la liquidación complementaria"}</option>
            {details.map(d => <option key={d.settlementId} value={d.settlementId}>{formatDisplayDate(d.eventDate)} · Liquidación complementaria · {pesos(d.workNet)} netos</option>)}
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
      {open && reviewItems.length > 0 && <div className="mt-4 space-y-3 border-t pt-4">
        <p className="text-sm font-bold">Boletas pendientes de aprobación</p>
        {reviewItems.map(item => <div key={item.id} className="rounded-lg border p-3 space-y-2">
          <p className="text-sm">{formatDisplayDate(item.eventDate)} · {pesos(item.amount)} · {item.fileName}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => {
              const result = await viewBoletaSosAction(item.id);
              if (result.ok) window.open(result.url, "_blank", "noopener,noreferrer");
              else setMessage(result.message);
            })}>VER BOLETA</Button>
            {item.status === "BOLETA_RECEIVED" && <Button type="button" disabled={pending || item.paidAmount > 0} onClick={() => {
              if (!window.confirm("¿Confirmas que revisaste la boleta SII y deseas APROBARLA? Esto NO registra ningún pago.")) return;
              start(async () => {
                const result = await approveBoletaSosAction(item.id);
                setMessage(result.message);
                if (result.ok) { setReviewItems(items => items.map(x => x.id === item.id ? {...x,status:"READY_TO_PAY"} : x)); router.refresh(); }
              });
            }}>APROBAR BOLETA</Button>}
            {item.status === "PAID" && <p className="text-sm font-medium">Pago registrado: {pesos(item.paidAmount)}</p>}
          </div>
          {item.status === "READY_TO_PAY" && <form className="space-y-2 rounded-lg border p-3" action={form => start(async () => {
            if (!window.confirm(`¿Confirmas que YA pagaste ${pesos(item.amount)} y deseas registrar el comprobante? Esta operación marcará la liquidación complementaria como PAGADA.`)) return;
            form.set("complementaryId", item.id);
            const result = await registerBoletaSosPaymentAction(form);
            setMessage(result.message);
            if (result.ok) { setReviewItems(items => items.map(x => x.id === item.id ? {...x,status:"PAID",paidAmount:item.amount} : x)); router.refresh(); }
          })}>
            <p className="text-sm font-semibold">REGISTRAR PAGO · {pesos(item.amount)}</p>
            <label className="block text-sm">Fecha efectiva del pago<input required name="paymentDate" type="date" className="mt-1 min-h-10 w-full rounded-lg border bg-background px-2"/></label>
            <label className="block text-sm">Medio de pago<select required name="method" defaultValue="TRANSFERENCIA" className="mt-1 min-h-10 w-full rounded-lg border bg-background px-2"><option value="TRANSFERENCIA">Transferencia</option><option value="EFECTIVO">Efectivo</option><option value="OTRO">Otro</option></select></label>
            <label className="block text-sm">Referencia (opcional)<input name="reference" className="mt-1 min-h-10 w-full rounded-lg border bg-background px-2"/></label>
            <label className="block text-sm">Comprobante de pago<input required name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="mt-1 block w-full text-sm"/></label>
            <Button type="submit" disabled={pending}>{pending ? "Registrando…" : "CONFIRMAR PAGO REALIZADO"}</Button>
          </form>}
        </div>)}
      </div>}
      {message && <p aria-live="polite" className="mt-2 text-sm text-muted">{message}</p>}
    </section>
  );
}
