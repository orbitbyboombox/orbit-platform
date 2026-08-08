"use client";

import { Camera, Upload, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { uploadExpenseReceiptAction } from "../actions";

export interface LiveExpenseCaptureProps { open: boolean; onClose: () => void; }

export function LiveExpenseCapture({ onClose, open }: LiveExpenseCaptureProps) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  if (!open) return null;
  const submit = (formData: FormData) => startTransition(async () => {
    const result = await uploadExpenseReceiptAction(formData);
    setMessage(result.message);
    if (result.ok) window.setTimeout(onClose, 1200);
  });
  return <>
    <button aria-label="Cerrar captura de gasto" className="fixed inset-0 z-40 cursor-default bg-black/55 backdrop-blur-[2px]" onClick={onClose} type="button" />
    <aside aria-label="Captura de gasto" aria-modal="true" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l bg-card shadow-2xl" role="dialog">
      <header className="flex items-start justify-between border-b p-5 sm:p-7"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Gasto rápido</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Sube tu comprobante</h2><p className="mt-2 text-sm text-muted">Guardaremos el archivo original. OCR puede completarse después.</p></div><Button aria-label="Cerrar panel" onClick={onClose} size="icon" variant="ghost"><X className="size-4" /></Button></header>
      <form action={submit} className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Nombre<input className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" name="firstName" required/></label><label className="text-sm font-medium">Apellido<input className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" name="lastName" required/></label></div>
        <label className="grid min-h-44 cursor-pointer place-items-center rounded-2xl border border-dashed bg-background/35 p-6 text-center transition hover:border-brand"><span><Camera className="mx-auto size-8 text-brand"/><span className="mt-3 block font-semibold">Fotografiar o seleccionar comprobante</span><span className="mt-1 block text-xs text-muted">JPG, PNG, WEBP o PDF · máximo 20 MB</span></span><input accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="sr-only" name="receipt" required type="file" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Fecha<input className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" defaultValue={new Date().toISOString().slice(0,10)} name="occurredOn" required type="date"/></label><label className="text-sm font-medium">Total<input className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" inputMode="numeric" min="1" name="total" placeholder="$" required type="number"/></label></div>
        <label className="text-sm font-medium">Categoría<select className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" defaultValue="OTHER" name="category"><option value="FUEL">Combustible</option><option value="SUPPLIES">Insumos</option><option value="MAINTENANCE">Mantención</option><option value="TRANSPORT">Transporte</option><option value="OTHER">Otro</option></select></label>
        <label className="text-sm font-medium">Proveedor (opcional)<input className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" name="supplier"/></label>
        <label className="text-sm font-medium">Comentario<input className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" name="comment" placeholder="Contexto del gasto"/></label>
        <Button className="mt-auto min-h-12" disabled={pending} type="submit"><Upload className="mr-2 size-4"/>{pending?"Guardando…":"Guardar comprobante"}</Button>
        {message&&<p aria-live="polite" className="text-sm font-medium">{message}</p>}
      </form>
    </aside>
  </>;
}
