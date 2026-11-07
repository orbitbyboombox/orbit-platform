"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StaffTrainingPanel, type TrainingStaffOption } from "@/components/staff-training-panel";
import { saveStaffTraining } from "@/app/staff/capacitaciones/actions";

type EventOption = { id: string; name: string };
export function TrainingPreviewWorkspace({ staff, events }: { staff: TrainingStaffOption[]; events: EventOption[] }) {
  const [eventId, setEventId] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const matchingEvents = events.filter(event => event.name.toLocaleLowerCase("es-CL").includes(eventSearch.trim().toLocaleLowerCase("es-CL")));
  const [rate, setRate] = useState("");
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const numericRate = rate.trim() === "" ? NaN : Number(rate);
  return <div className="space-y-5 rounded-2xl border border-white/10 bg-[#10151d] p-5 shadow-xl md:p-7">
    <div className="mb-1"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">Nueva capacitación</span><h2 className="mt-2 text-xl font-semibold text-white">Asignar formación a un evento</h2><p className="mt-1 text-sm text-slate-400">Selecciona el evento, define la tarifa y asigna al equipo.</p></div>
    <label className="block text-sm font-medium text-slate-200">Buscar evento por nombre, código o fecha
      <input type="search" value={eventSearch} onChange={e => setEventSearch(e.target.value)} placeholder="Ej.: CCU, ORB-2026 o 2026-11-07" className="mt-2 w-full rounded-xl border border-white/15 bg-[#171e29] px-4 py-3 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20" />
    </label>
    <label className="block text-sm font-medium text-slate-200">Evento
      <select className="mt-2 w-full rounded-xl border border-white/15 bg-[#171e29] px-4 py-3 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 [color-scheme:dark]" value={eventId} onChange={e => setEventId(e.target.value)}>
        <option value="">Seleccionar evento</option>
        {matchingEvents.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
      </select>
      {matchingEvents.length === 0 && <span role="status" className="mt-2 block text-xs text-orange-300">No hay eventos que coincidan. Prueba con otra fecha, código o nombre.</span>}
    </label>
    <label className="block text-sm font-medium text-slate-200">Tarifa normal de operador del evento (CLP)
      <input className="mt-2 w-full rounded-xl border border-white/15 bg-[#171e29] px-4 py-3 text-white outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 [color-scheme:dark]" type="number" min="0" step="1" value={rate} onChange={e => setRate(e.target.value)} />
    </label>
    <p className="text-xs leading-relaxed text-slate-400">Ingresa la tarifa real de operador de este evento antes de guardar. No se propone una tarifa por defecto. El capacitador no recibe pago extra por enseñar: conserva únicamente su tarifa habitual del evento.</p>
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
    <p className="text-xs opacity-75">Solo se paga el 50% al operador nuevo cuando la capacitación esté COMPLETADA. PROGRAMADO no se contabiliza. Al marcar COMPLETADA, el 50% se integra a la próxima liquidación mensual abierta del operador en capacitación y a su nómina PDF.</p>
  </div>;
}
