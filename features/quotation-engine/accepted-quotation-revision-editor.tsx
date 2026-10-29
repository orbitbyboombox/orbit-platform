"use client";

import { useState, useTransition } from "react";
import { prepareAcceptedQuotationRevisionAction } from "./quotation.actions";

type Line = { id: number; label: string; quantity: number; unitPrice: number };

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);

export function AcceptedQuotationRevisionEditor({ projectId, originalItems = [] }: { projectId: string; originalItems?: readonly { label: string; quantity: number; total: number }[] }) {
  const [items, setItems] = useState<Line[]>(() => originalItems.length ? originalItems.map((item, index) => ({ id: index + 1, label: item.label, quantity: item.quantity, unitPrice: item.quantity > 0 ? Math.round(item.total / item.quantity) : 0 })) : [{ id: 1, label: "", quantity: 1, unitPrice: 0 }]);
  const [nextId, setNextId] = useState(originalItems.length + 1 || 2);
  const [vatPercent, setVatPercent] = useState(19);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState("");
  const [pending, startTransition] = useTransition();
  const net = items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPrice), 0);
  const tax = Math.round(net * vatPercent / 100);
  const valid = items.length > 0 && items.every(item => item.label.trim() && Number.isFinite(item.quantity) && item.quantity > 0 && Number.isFinite(item.unitPrice) && item.unitPrice >= 0) && reason.trim().length >= 3;
  const edit = (id: number, patch: Partial<Line>) => setItems(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row));
  const prepare = () => startTransition(async () => {
    setResult("");
    const response = await prepareAcceptedQuotationRevisionAction({
      projectId, netAmount: net, vatPercent, reason,
      items: items.map(({ label, quantity, unitPrice }) => ({ label, quantity, unitPrice })),
    });
    setResult(response.ok ? response.message : response.error);
  });
  return <section className="space-y-4 rounded-2xl border bg-card p-4" aria-label="Editor de revisión comercial">
    <div><h3 className="text-lg font-semibold">Revisión de cotización aceptada</h3><p className="text-sm text-muted">Se cargan las partidas de la cotización actual cuando están disponibles. Revisa los importes antes de preparar el PDF. La cotización aceptada se conserva y no se envían correos.</p></div>
    {items.map((item, index) => <div key={item.id} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-12">
      <label className="sm:col-span-6 text-sm">Servicio o extra #{index + 1}<input className="mt-1 w-full rounded-lg border bg-background p-2" value={item.label} maxLength={200} onChange={e => edit(item.id, { label: e.target.value })} /></label>
      <label className="sm:col-span-2 text-sm">Cantidad<input className="mt-1 w-full rounded-lg border bg-background p-2" type="number" min="0.01" step="any" value={item.quantity} onChange={e => edit(item.id, { quantity: Number(e.target.value) })} /></label>
      <label className="sm:col-span-3 text-sm">Precio unitario<input className="mt-1 w-full rounded-lg border bg-background p-2" type="number" min="0" step="1" value={item.unitPrice} onChange={e => edit(item.id, { unitPrice: Number(e.target.value) })} /></label>
      <button className="self-end rounded-lg border p-2 text-sm sm:col-span-1" type="button" disabled={items.length === 1} onClick={() => setItems(rows => rows.filter(row => row.id !== item.id))} aria-label="Eliminar partida">Quitar</button>
    </div>)}
    <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold" disabled={items.length >= 100} onClick={() => { setItems(rows => [...rows, { id: nextId, label: "", quantity: 1, unitPrice: 0 }]); setNextId(id => id + 1); }}>+ Agregar servicio o extra</button>
    <label className="block text-sm">IVA (%)<input className="mt-1 block w-28 rounded-lg border bg-background p-2" type="number" min="0" max="100" value={vatPercent} onChange={e => setVatPercent(Number(e.target.value))} /></label>
    <div className="space-y-1 rounded-xl border p-3 text-sm"><p>Neto: {money(net)}</p><p>IVA: {money(tax)}</p><p className="font-semibold">Total propuesta: {money(net + tax)}</p></div>
    <label className="block text-sm">Motivo de la revisión<textarea className="mt-1 w-full rounded-lg border bg-background p-3" value={reason} onChange={e => setReason(e.target.value)} /></label>
    <button type="button" className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-brand-foreground disabled:opacity-50" disabled={pending || !valid || vatPercent < 0 || vatPercent > 100} onClick={prepare}>{pending ? "Preparando…" : "Preparar PDF revisado (sin enviar)"}</button>
    {result && <p role="status" className="text-sm">{result}</p>}
  </section>;
}
