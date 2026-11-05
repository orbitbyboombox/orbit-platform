"use client";

import { useState } from "react";
import { StaffTrainingPanel, type TrainingStaffOption } from "@/components/staff-training-panel";

type EventOption = { id: string; name: string };
export function TrainingPreviewWorkspace({ staff, events }: { staff: TrainingStaffOption[]; events: EventOption[] }) {
  const [eventId, setEventId] = useState("");
  const [rate, setRate] = useState("12000");
  const numericRate = rate.trim() === "" ? NaN : Number(rate);
  return <div className="space-y-4">
    <label className="block text-sm">Evento
      <select className="mt-1 w-full rounded border p-2 text-gray-900" value={eventId} onChange={e => setEventId(e.target.value)}>
        <option value="">Seleccionar evento</option>
        {events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
      </select>
    </label>
    <label className="block text-sm">Tarifa normal de operador del evento (CLP)
      <input className="mt-1 w-full rounded border p-2 text-gray-900" type="number" min="0" step="1" value={rate} onChange={e => setRate(e.target.value)} />
    </label>
    <p className="text-xs opacity-75">La tarifa debe verificarse manualmente con el contrato del evento. No se toma de pagos personalizados.</p>
    <StaffTrainingPanel eventId={eventId} normalOperatorRateClp={numericRate} staff={staff} />
    <p className="text-xs opacity-75">Vista previa de solo lectura: no crea asignaciones ni liquida pagos.</p>
  </div>;
}
