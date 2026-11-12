'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordIncidentResolution } from './incident-resolution.actions';
export function IncidentResolution({ id, resolved }: { id: string; resolved: boolean }) {
  const [resolution, setResolution] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return <section id="resolution" className="mt-5 scroll-mt-24 rounded-xl border p-4"><h2 className="text-lg font-semibold">Registrar reparación realizada</h2>{resolved ? <p className="mt-3 text-success">Incidencia resuelta.</p> : <form className="mt-3 grid gap-3" onSubmit={event => { event.preventDefault(); start(async () => { const result = await recordIncidentResolution(id, resolution); setFeedback(result.ok ? 'Resolución registrada. El pendiente se actualizará en el Dashboard.' : result.error); if (result.ok) router.refresh(); }); }}><label className="grid gap-2 text-sm">Qué se corrigió y cómo se verificó<textarea autoFocus className="min-h-28 w-full rounded-xl border bg-background p-3 text-base" minLength={10} maxLength={2000} required value={resolution} onChange={event => setResolution(event.target.value)} /></label><p className="text-xs text-muted">Registra solo una reparación ya realizada. Este formulario no modifica inventario, pagos ni cierres.</p><button className="min-h-11 rounded-xl border px-4 font-semibold text-brand" type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Confirmar reparación realizada'}</button></form>}{feedback ? <p role="status" className="mt-3 text-sm">{feedback}</p> : null}</section>;
}
