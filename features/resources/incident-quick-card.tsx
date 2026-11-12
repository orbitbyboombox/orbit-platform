'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { recordIncidentResolution } from '@/features/founder-action-center/incident-resolution.actions';
import type { IncidentObservation } from './incident-observation';
export function IncidentQuickCard({ incident, onResolved, saveAction = recordIncidentResolution }: { incident: IncidentObservation; onResolved: () => void; saveAction?: typeof recordIncidentResolution }) {
  const [editing, setEditing] = useState(false), [note, setNote] = useState(''), [feedback, setFeedback] = useState('');
  const [pending, start] = useTransition();
  return <article className="min-w-0 px-4 py-4" data-incident-id={incident.id}>
    <h3 className="text-base font-bold text-brand">{incident.box}</h3>
    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{incident.observation}</p>
    <p className="mt-2 break-words text-xs text-muted">{incident.event}{incident.staff ? ` · ${incident.staff}` : ''}</p>
    {editing ? <form className="mt-3 grid gap-2" onSubmit={event => { event.preventDefault(); start(async () => { const result = await saveAction(incident.id, note); if (result.ok) onResolved(); else setFeedback(result.error); }); }}>
      <label className="grid gap-2 text-sm">Reparación realizada<textarea autoFocus className="min-h-20 w-full rounded-xl border bg-background p-3 text-base" placeholder="Ej: Se cambió el cable y se probó el equipo." minLength={10} maxLength={2000} required value={note} onChange={event => setNote(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><button className="min-h-11 rounded-xl bg-brand px-4 text-xs font-bold text-brand-foreground disabled:opacity-50" type="submit" disabled={pending}>{pending ? 'GUARDANDO…' : 'GUARDAR Y DEJAR RESUELTO'}</button><button className="min-h-11 rounded-xl border px-3 text-xs" disabled={pending} type="button" onClick={() => setEditing(false)}>Cancelar</button></div>
    </form> : <button type="button" className="mt-3 min-h-11 rounded-xl border border-success/40 px-4 text-xs font-bold text-success" onClick={() => setEditing(true)}>REPARADO</button>}
    {feedback ? <p role="status" className="mt-2 text-sm text-warning">{feedback}</p> : null}
    {incident.projectId ? <Link href={`/projects/${encodeURIComponent(incident.projectId)}?eventTab=OPERATION#operator-observations`} className="mt-2 inline-flex min-h-11 items-center text-xs text-muted underline">Ver observaciones del evento</Link> : null}
  </article>;
}
