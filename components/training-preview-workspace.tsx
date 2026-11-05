"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StaffTrainingPanel, type TrainingStaffOption } from "@/components/staff-training-panel";
import { saveStaffTraining } from "@/app/staff/capacitaciones/actions";

type EventOption = { id: string; name: string };
export function TrainingPreviewWorkspace({ staff, events }: { staff: TrainingStaffOption[]; events: EventOption[] }) {
  const [eventId, setEventId] = useState("");
  const [rate, setRate] = useState("");
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
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
    <p className="text-xs opacity-75">Ingresa la tarifa real de operador de este evento antes de guardar. No se propone una tarifa por defecto. El pago del capacitador no cambia.</p>
    <StaffTrainingPanel eventId={eventId} normalOperatorRateClp={numericRate} staff={staff}
      onConfirm={pending ? undefined : assignment => {
        setMessage("");
        startTransition(async () => {
          const result = await saveStaffTraining(assignment);
          setMessage(result.message);
          if (result.ok) router.refresh();
        });
      }}
    />
    {pending && <p role="status">Guardando capacitación…</p>}
    {message && <p role="status" className="font-medium">{message}</p>}
    <p className="text-xs opacity-75">El registro queda PROGRAMADO. No se contabiliza automáticamente en la liquidación ni en la nómina PDF.</p>
  </div>;
}
