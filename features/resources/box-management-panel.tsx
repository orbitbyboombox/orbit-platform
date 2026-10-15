"use client";

import { useMemo, useState } from "react";
import { blackBoxNumber, blackBoxStock, type BoxAsset } from "./box-inventory";
import type { InventoryMovement } from "@/features/supply-engine/types/supply.types";

type BoxManagementPanelProps = {
  boxes: BoxAsset[];
  movements: readonly InventoryMovement[];
  warehousePhotos: number;
  onEditBox: (boxId: string) => void;
  onAssignBox: () => void;
};

const monthValue = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);

function monthLabel(value: string) {
  if (!value) return "Todos los meses";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "America/Santiago" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function inMonth(value: string | null | undefined, month: string) {
  return !month || Boolean(value?.startsWith(month));
}

export function BoxManagementPanel({ boxes, movements, warehousePhotos, onEditBox, onAssignBox }: BoxManagementPanelProps) {
  const [selectedBoxId, setSelectedBoxId] = useState(boxes[0]?.id ?? "");
  const [selectedMonth, setSelectedMonth] = useState(monthValue());
  const [requestedPhotos, setRequestedPhotos] = useState(700);
  const selectedBox = boxes.find((box) => box.id === selectedBoxId) ?? boxes[0];
  const assignedEvents = useMemo(() => selectedBox?.assignments.filter((assignment) => inMonth(assignment.eventDate, selectedMonth)) ?? [], [selectedBox, selectedMonth]);
  const selectedProjectIds = new Set(selectedBox?.assignments.map((assignment) => assignment.projectId) ?? []);
  const selectedMovements = movements.filter((movement) => inMonth(movement.occurredAt, selectedMonth) && (!movement.projectId || selectedProjectIds.has(movement.projectId)));
  const before = selectedBox ? blackBoxStock(selectedBox.metadata) : 0;
  const after = before + Math.max(0, requestedPhotos);
  const warehouseAfter = Math.max(0, warehousePhotos - Math.max(0, requestedPhotos));

  return <section className="space-y-4 rounded-2xl border border-brand/30 bg-card p-4 sm:p-5" data-box-management-panel aria-labelledby="box-management-title">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">GESTIÓN DE CAJAS</p><h2 id="box-management-title" className="mt-1 text-xl font-semibold">Historial y asignación de papel</h2><p className="mt-1 text-sm text-muted">Consulta eventos y movimientos por caja y mes. La transferencia permanece bloqueada hasta validar una operación transaccional.</p></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="grid gap-1 text-xs font-semibold text-muted">CAJA<select data-box-management-selector="box" className="min-h-10 rounded-lg border bg-background px-3 text-sm font-normal" value={selectedBox?.id ?? ""} onChange={(event) => setSelectedBoxId(event.target.value)}><option value="">Seleccionar caja</option>{boxes.map((box) => <option key={box.id} value={box.id}>Caja {blackBoxNumber(box.asset_code)}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold text-muted">MES<select data-box-management-selector="month" className="min-h-10 rounded-lg border bg-background px-3 text-sm font-normal" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}><option value="">Todos los meses</option>{Array.from(new Set(boxes.flatMap((box) => box.assignments.map((assignment) => assignment.eventDate.slice(0, 7))).filter(Boolean))).sort().reverse().map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}{selectedMonth && !boxes.some((box) => box.assignments.some((assignment) => assignment.eventDate.startsWith(selectedMonth))) ? <option value={selectedMonth}>{monthLabel(selectedMonth)}</option> : null}</select></label>
      </div>
    </div>
    {selectedBox ? <>
      <div className="grid gap-3 md:grid-cols-3" data-box-paper-preview>
        <div className="rounded-xl border p-3"><p className="text-xs text-muted">Fotos actuales</p><p className="mt-1 text-2xl font-semibold">{before.toLocaleString("es-CL")}</p><p className="text-xs text-muted">Conteo operativo de Caja {blackBoxNumber(selectedBox.asset_code)}</p></div>
        <label className="rounded-xl border p-3 text-xs font-semibold text-muted">CARGA A PREVISUALIZAR<input data-box-paper-quantity type="number" min="0" step="1" value={requestedPhotos} onChange={(event) => setRequestedPhotos(Math.max(0, Number(event.target.value) || 0))} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-base font-normal"/><span className="mt-1 block font-normal">La operación real no se ejecuta.</span></label>
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-3"><p className="text-xs text-muted">Vista previa después</p><p className="mt-1 text-2xl font-semibold">{after.toLocaleString("es-CL")} fotos</p><p className="text-xs text-muted">Bodega quedaría en {warehouseAfter.toLocaleString("es-CL")} fotos · referencia sin escritura</p></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Eventos asignados · {monthLabel(selectedMonth)}</h3><p className="text-xs text-muted">Historial mensual de Caja {blackBoxNumber(selectedBox.asset_code)}</p></div><button type="button" className="rounded-lg border px-3 py-2 text-xs font-semibold" onClick={() => onEditBox(selectedBox.id)}>Editar stock</button></div><div className="mt-3 space-y-2">{assignedEvents.length ? assignedEvents.map((assignment) => <div className="rounded-lg border bg-background/30 p-3" key={assignment.id}><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-medium">{assignment.eventName}</p><span className="text-xs text-muted">{assignment.eventDate}</span></div><p className="mt-1 text-xs text-muted">{assignment.eventTime?.slice(0, 5) || "Horario pendiente"}</p></div>) : <p className="text-sm text-muted">No hay eventos asignados para este filtro.</p>}</div></div>
        <div className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Movimientos registrados</h3><p className="text-xs text-muted">Lotes, consumos y ajustes relacionados</p></div><button type="button" className="rounded-lg border px-3 py-2 text-xs font-semibold" onClick={onAssignBox}>Gestionar asignación</button></div><div className="mt-3 space-y-2">{selectedMovements.length ? selectedMovements.slice(0, 20).map((movement) => <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border bg-background/30 p-3" key={movement.id}><span className="text-sm">{movement.reason || movement.movementType}</span><span className="text-xs text-muted">{movement.occurredAt.slice(0, 10)} · {movement.quantity > 0 ? "+" : ""}{movement.quantity}</span></div>) : <p className="text-sm text-muted">No hay movimientos registrados para este filtro.</p>}</div><p className="mt-3 text-xs text-muted">El historial físico detallado permanece disponible en Ver detalle de cada caja.</p></div>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-amber-200">Previsualización: {before} + {requestedPhotos} = {after} fotos; Bodega: {warehousePhotos} → {warehouseAfter}. Sin descuento real ni movimiento creado.</p><button type="button" disabled className="min-h-10 rounded-lg border px-3 text-xs font-semibold opacity-60">CONFIRMAR CARGA · BLOQUEADA</button></div>
    </> : <p className="text-sm text-muted">No hay cajas disponibles para gestionar.</p>}
  </section>;
}
