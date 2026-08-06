"use client";

import { Camera, FileWarning, X } from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

export interface LiveExpenseCaptureProps { open: boolean; onClose: () => void; }

export function LiveExpenseCapture({ onClose, open }: LiveExpenseCaptureProps) {
  if (!open) return null;
  return <>
    <button aria-label="Cerrar captura de gasto" className="fixed inset-0 z-40 cursor-default bg-black/55 backdrop-blur-[2px]" onClick={onClose} type="button" />
    <aside aria-label="Captura de gasto" aria-modal="true" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l bg-card shadow-2xl" role="dialog">
      <header className="flex items-start justify-between border-b p-5 sm:p-7"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">GASTO EN VIVO</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Sube tu gasto aquí</h2><p className="mt-2 text-sm text-muted">Captura y clasificación de comprobantes.</p></div><Button aria-label="Cerrar panel" onClick={onClose} size="icon" variant="ghost"><X aria-hidden="true" className="size-4" /></Button></header>
      <div className="flex flex-1 items-center p-5 sm:p-7"><SmartCard className="w-full border-warning/25" icon={<FileWarning aria-hidden="true" className="size-5" />} primaryValue="OCR no configurado" secondaryValue="La captura permanecerá deshabilitada hasta conectar un proveedor de lectura de comprobantes. Ningún gasto será registrado sin información verificada." status={<StatusBadge label="No disponible" variant="warning" />} title="Captura de gastos"><div className="mt-5 flex items-center gap-3 rounded-xl border bg-background/35 p-4 text-sm text-muted"><Camera aria-hidden="true" className="size-5 shrink-0" />Cuando el servicio esté disponible podrás fotografiar el documento y confirmar los datos antes de guardarlo.</div></SmartCard></div>
    </aside>
  </>;
}
