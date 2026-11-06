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
    <section aria-label="Capacitaciones" className="space-y-5 rounded-xl border border-white/10 bg-[#0b1018] p-5">
      <h2 className="text-lg font-semibold text-white">Equipo de capacitación</h2>
      <p className="text-sm leading-relaxed text-slate-400">El operador en formación recibe el 50% de la tarifa normal del evento. El pago del capacitador no cambia.</p>
      <label className="block text-sm font-medium text-slate-200">Operador en capacitación
        <select className="mt-2 w-full rounded-xl border border-white/15 bg-[#171e29] px-4 py-3 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 [color-scheme:dark]" value={traineeStaffId} onChange={e => setTraineeStaffId(e.target.value)}>
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
      <div className="rounded-xl border border-orange-400/20 bg-orange-400/10 p-4 text-slate-100">
        <p>Tarifa normal: {Number.isFinite(normalOperatorRateClp) ? `${normalOperatorRateClp.toLocaleString("es-CL")}` : "—"}</p>
        <p>Capacitación (50%): <strong>{result.preview ? `$${result.preview.amountClp.toLocaleString("es-CL")}` : "—"}</strong></p>
      </div>
      {result.error && Number.isFinite(normalOperatorRateClp) && <p role="status" className="text-sm text-gray-400">{result.error === "Event, trainee and trainer are required" ? "Selecciona un evento, un operador en capacitación y un capacitador." : result.error}</p>}
      <button type="button" disabled={!result.preview || !onConfirm} onClick={() => { if (result.preview && onConfirm) onConfirm(result.preview); }} className="rounded-xl bg-orange-500 px-6 py-3 font-semibold text-[#111] transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">
        Confirmar capacitación
      </button>
      {!onConfirm && <p className="text-xs">Vista previa: guardado y liquidación aún no habilitados.</p>}
    </section>
  );
}
