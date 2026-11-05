"use client";

import { useState } from "react";
import { StaffTrainingPanel } from "@/components/staff-training-panel";

/** Isolated UI for verifying event-rate calculations before DB integration. */
export function TrainingPreviewWorkspace() {
  const [eventId, setEventId] = useState("");
  const [rate, setRate] = useState("12000");
  const [staffText, setStaffText] = useState("");
  const staff = staffText.split("\n").map((line, index) => line.trim() ? { id: `preview-${index}`, name: line.trim() } : null).filter((person): person is { id: string; name: string } => person !== null);
  const numericRate = rate.trim() === "" ? NaN : Number(rate);
  return <div className="space-y-4">
    <label className="block text-sm">ID de evento para simulación
      <input className="mt-1 w-full rounded border p-2 text-gray-900" value={eventId} onChange={e => setEventId(e.target.value)} placeholder="Identificador del evento" />
    </label>
    <label className="block text-sm">Tarifa normal de operador (CLP)
      <input className="mt-1 w-full rounded border p-2 text-gray-900" type="number" min="0" step="1" value={rate} onChange={e => setRate(e.target.value)} />
    </label>
    <label className="block text-sm">Nombres para simulación (uno por línea)
      <textarea className="mt-1 w-full rounded border p-2 text-gray-900" rows={4} value={staffText} onChange={e => setStaffText(e.target.value)} placeholder={"Operador nuevo\nCapacitador"} />
    </label>
    <StaffTrainingPanel eventId={eventId} normalOperatorRateClp={numericRate} staff={staff} />
    <p className="text-xs opacity-75">Los nombres ingresados son solo datos de simulación; no se consultan ni guardan registros reales.</p>
  </div>;
}
