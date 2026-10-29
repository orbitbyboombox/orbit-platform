"use client";

import { useState, useTransition } from "react";
import { updateEventCoreDetailsAction } from "../actions/update-event-core-details.actions";

export function EventCoreDetailsEditor(props: { projectId: string; version: number; eventDate: string; eventTime: string; location: string; city: string }) {
  const [version, setVersion] = useState(props.version);
  const [eventDate, setEventDate] = useState(props.eventDate);
  const [eventTime, setEventTime] = useState(props.eventTime.slice(0, 5));
  const [location, setLocation] = useState(props.location);
  const [city, setCity] = useState(props.city);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const result = await updateEventCoreDetailsAction({ projectId: props.projectId, expectedVersion: version, eventDate, eventTime, location, city, reason });
    setMessage(result.message);
    if (result.version !== undefined) setVersion(result.version);
    if (result.ok) { setReason(""); setConfirmed(false); }
  });
  return <section className="space-y-3 rounded-2xl border p-4">
    <h3 className="text-lg font-semibold">Editar fecha, horario y ubicación</h3>
    <p className="text-sm text-muted">Los cambios quedan registrados. Revisa las asignaciones de personal si modificas la fecha o el horario.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Fecha del evento<input className="mt-1 w-full rounded-lg border bg-background p-2" type="date" value={eventDate} onChange={e => { setConfirmed(false); setEventDate(e.target.value); }} /></label>
      <label className="text-sm">Hora de inicio<input className="mt-1 w-full rounded-lg border bg-background p-2" type="time" value={eventTime} onChange={e => { setConfirmed(false); setEventTime(e.target.value); }} /></label>
      <label className="text-sm">Lugar y dirección<input className="mt-1 w-full rounded-lg border bg-background p-2" value={location} onChange={e => { setConfirmed(false); setLocation(e.target.value); }} /></label>
      <label className="text-sm">Comuna<input className="mt-1 w-full rounded-lg border bg-background p-2" value={city} onChange={e => { setConfirmed(false); setCity(e.target.value); }} /></label>
    </div>
    <label className="block text-sm">Motivo del cambio<textarea className="mt-1 w-full rounded-lg border bg-background p-2" value={reason} onChange={e => { setConfirmed(false); setReason(e.target.value); }} /></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmo los nuevos datos. Entiendo que se actualizará el evento y se intentará sincronizar Calendar.</label>
    <button className="rounded-xl border px-4 py-2 font-semibold disabled:opacity-50" type="button" disabled={pending || !confirmed || reason.trim().length < 3 || !eventDate || !eventTime || !location.trim() || !city.trim()} onClick={save}>{pending ? "Guardando…" : "Guardar cambios del evento"}</button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
