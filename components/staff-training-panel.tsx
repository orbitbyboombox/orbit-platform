"use client";

import { useMemo, useState } from "react";
import { previewTrainingAssignment } from "@/lib/staff-training-assignment";

export type TrainingStaffOption = { id: string; name: string };
type Props = {
  eventId: string;
  normalOperatorRateClp: number;
  staff: TrainingStaffOption[];
  onConfirm?: (assignment: ReturnType<typeof previewTrainingAssignment>) => void;
};

/** Reusable UI only. Parent must implement authenticated persistence before enabling payments. */
export function StaffTrainingPanel({ eventId, normalOperatorRateClp, staff, onConfirm }: Props) {
  const [traineeStaffId, setTraineeStaffId] = useState("");
  const [trainerStaffId, setTrainerStaffId] = useState("");
  const result = useMemo(() => {
    try {
      return { preview: previewTrainingAssignment({ eventId, normalOperatorRateClp, traineeStaffId, trainerStaffId }), error: "" };
    } catch (error) {
      return { preview: null, error: error instanceof Error ? error.message : "Datos inválidos" };
    }
  }, [eventId, normalOperatorRateClp, traineeStaffId, trainerStaffId]);

  return (
    <section aria-label="Capacitaciones" className="rounded-xl border p-4 space-y-4">
      <h2 className="font-semibold text-lg">Capacitaciones</h2>
      <p className="text-sm">El operador en formación recibe el 50% de la tarifa normal del evento. El pago del capacitador no cambia.</p>
      <label className="block text-sm">Operador en capacitación
        <select className="mt-1 w-full rounded border p-2" value={traineeStaffId} onChange={e => setTraineeStaffId(e.target.value)}>
          <option value="">Seleccionar operador</option>
          {staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label>
      <label className="block text-sm">Operador capacitador
        <select className="mt-1 w-full rounded border p-2" value={trainerStaffId} onChange={e => setTrainerStaffId(e.target.value)}>
          <option value="">Seleccionar capacitador</option>
          {staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label>
      <div className="rounded-lg bg-gray-100 p-3 text-gray-900">
        <p>Tarifa normal: ${normalOperatorRateClp.toLocaleString("es-CL")}</p>
        <p>Capacitación (50%): <strong>{result.preview ? `$${result.preview.amountClp.toLocaleString("es-CL")}` : "—"}</strong></p>
      </div>
      {result.error && <p role="status" className="text-sm text-gray-600">{result.error}</p>}
      <button type="button" disabled={!result.preview || !onConfirm} onClick={() => { if (result.preview && onConfirm) onConfirm(result.preview); }} className="rounded-lg border px-4 py-2 disabled:opacity-50">
        Confirmar capacitación
      </button>
      {!onConfirm && <p className="text-xs">Vista previa: guardado y liquidación aún no habilitados.</p>}
    </section>
  );
}
