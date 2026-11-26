"use client";

import { useState, useTransition } from "react";
import { calculateTributaryDraft, type TributaryLine, type TributaryDiscount } from "../tributary-calculation";
import { updateTributaryDraftAction } from "../tributary-actions";

export type EditorSnapshot = {
  lines?: TributaryLine[];
  customer?: Record<string, string>;
  reference?: Record<string, string>;
  dispatch?: Record<string, string>;
  globalDiscount?: TributaryDiscount;
  notes?: string;
};

const field = "mt-1 block w-full rounded-lg border bg-background p-2";
const customerFields = [["rut", "RUT"], ["company", "Razón social"], ["address", "Dirección"], ["city", "Comuna"], ["giro", "Giro"]];
const money = (value: number) => value.toLocaleString("es-CL", { style: "currency", currency: "CLP" });

export function DraftLineEditor({ draft, onClose, onSaved }: {
  draft: { id: string; updated_at: string; tributary_document_type: string; tributary_snapshot?: EditorSnapshot };
  onClose: () => void; onSaved: () => void;
}) {
  const snapshot = draft.tributary_snapshot;
  const [lines, setLines] = useState(() => (snapshot?.lines ?? []).map(line => ({ ...line, key: crypto.randomUUID() })));
  const [customer, setCustomer] = useState(snapshot?.customer ?? {});
  const [reference, setReference] = useState(snapshot?.reference ?? {});
  const [dispatch, setDispatch] = useState(snapshot?.dispatch ?? {});
  const [discount, setDiscount] = useState(snapshot?.globalDiscount);
  const [notes, setNotes] = useState(snapshot?.notes ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  let totals;
  try { totals = calculateTributaryDraft(lines, discount).totals; } catch { totals = null; }
  const missing = draft.tributary_document_type === "39" ? [] : customerFields.filter(([key]) => !customer[key]?.trim()).map(([, label]) => label);
  const isNote = ["56", "61"].includes(draft.tributary_document_type);
  const isGuide = draft.tributary_document_type === "52";
  if (isNote && !["type", "folio", "date", "reason"].every(key => reference[key]?.trim())) missing.push("Referencia al documento original");
  if (isGuide && !dispatch.transferReason?.trim()) missing.push("Motivo del traslado");
  const changeLine = (key: string, changes: Partial<TributaryLine>) => setLines(current => current.map(line => line.key === key ? { ...line, ...changes } : line));
  function save() {
    start(async () => {
      const result = await updateTributaryDraftAction({ draftId: draft.id, revision: draft.updated_at, lines: lines.map(({ key, ...line }) => { void key; return line; }), customer, reference, dispatch, notes, globalDiscount: discount });
      if (result.ok) onSaved(); else setError(result.error);
    });
  }
  const discountControl = (label: string, value: TributaryDiscount | undefined, change: (discount: TributaryDiscount | undefined) => void) => (
    <div className="grid grid-cols-2 gap-2">
      <label>{label}<select className={field} value={value?.type ?? ""} onChange={e => change(e.target.value ? { type: e.target.value === "CLP" ? "CLP" : "PERCENT", value: value?.value ?? 0 } : undefined)}><option value="">Sin descuento</option><option value="PERCENT">Porcentaje</option><option value="CLP">Monto CLP</option></select></label>
      {value && <label>Valor<input className={field} type="number" min="0" value={value.value} onChange={e => change({ ...value, value: Number(e.target.value) })}/></label>}
    </div>
  );
  return <fieldset disabled={pending} className="mt-4 space-y-4 rounded-lg border p-3 text-sm" aria-label="Editar borrador">
    <div className="grid gap-2 sm:grid-cols-2">{customerFields.map(([key, label]) => <label key={key}>{label}<input className={field} value={customer[key] ?? ""} onChange={e => setCustomer({ ...customer, [key]: e.target.value })}/></label>)}</div>
    {lines.map((line, index) => <div className="grid gap-2 rounded border p-2 sm:grid-cols-2" key={line.key}>
      <label>Servicio {index + 1}<input className={field} value={line.description} onChange={e => changeLine(line.key, { description: e.target.value })}/></label>
      <label>Cantidad<input className={field} type="number" min="0" step="any" value={line.quantity} onChange={e => changeLine(line.key, { quantity: Number(e.target.value) })}/></label>
      <label>Precio unitario<input className={field} type="number" min="0" value={line.unitPrice} onChange={e => changeLine(line.key, { unitPrice: Number(e.target.value) })}/></label>
      {discountControl("Descuento de línea", line.discount, value => changeLine(line.key, { discount: value }))}
      <label><input type="checkbox" checked={line.exempt} onChange={e => changeLine(line.key, { exempt: e.target.checked })}/> Exento de IVA</label>
      <button type="button" className="justify-self-start underline" onClick={() => setLines(lines.filter(item => item.key !== line.key))}>Eliminar línea {index + 1}</button>
    </div>)}
    <button type="button" className="rounded border px-3 py-2" onClick={() => setLines([...lines, { key: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, exempt: false }])}>Agregar servicio</button>
    {discountControl("Descuento global", discount, setDiscount)}
    {isNote && <div className="grid gap-2 sm:grid-cols-2">{[["type","Tipo DTE original"],["folio","Folio de referencia"],["date","Fecha del documento original"],["reason","Motivo de referencia"]].map(([key,label]) => <label key={key}>{label}<input className={field} type={key === "date" ? "date" : "text"} value={reference[key] ?? ""} onChange={e => setReference({ ...reference, [key]: e.target.value })}/></label>)}</div>}
    {isGuide && <label>Motivo del traslado<input className={field} value={dispatch.transferReason ?? ""} onChange={e => setDispatch({ ...dispatch, transferReason: e.target.value })}/></label>}
    <label>Observaciones<textarea className={field} value={notes} onChange={e => setNotes(e.target.value)}/></label>
    {totals && <p aria-live="polite">Neto {money(totals.net)} · Exento {money(totals.exempt)} · IVA {money(totals.vat)} · Total {money(totals.total)}</p>}
    {missing.length > 0 && <p role="status">Pendiente para aprobar: {missing.join(", ")}.</p>}
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="button" className="rounded border px-3 py-2" disabled={!totals || !lines.length} onClick={save}>Guardar cambios</button><button type="button" className="rounded border px-3 py-2" onClick={onClose}>Cancelar</button></div>
  </fieldset>;
}
