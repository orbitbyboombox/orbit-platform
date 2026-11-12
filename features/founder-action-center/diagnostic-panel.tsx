'use client';
import Link from 'next/link';
import type { recordIncidentResolution } from './incident-resolution.actions';
import { IncidentQuickCard } from '@/features/resources/incident-quick-card';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { FounderActionItem } from './index';
import type { ActionDiagnostic } from './diagnostic-model';
import { inspectFounderAction, validateFounderActions } from './diagnostic.actions';
import { acknowledgeFounderAction } from './actions';

export function ActionDiagnosticPanel({ item, onResolved, inspectAction = inspectFounderAction, validateAction = validateFounderActions, repairAction }: { item: FounderActionItem; onResolved: (id: string) => void; inspectAction?: typeof inspectFounderAction; validateAction?: typeof validateFounderActions; repairAction?: typeof recordIncidentResolution }) {
  const [open, setOpen] = useState(false);
  const [diagnostic, setDiagnostic] = useState<ActionDiagnostic | null>(null);
  const [feedback, setFeedback] = useState('');
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const inspect = () => {
    setOpen(true); setFeedback('');
    start(async () => {
      const result = await inspectAction(item.id);
      if (result.ok) setDiagnostic(result.diagnostic); else setFeedback(result.error);
    });
  };
  const markReady = () => {
    setFeedback('');
    start(async () => {
      try {
        const result = await validateAction([item.id]);
        if (result.diagnostics?.[0]) setDiagnostic(result.diagnostics[0]);
        if (result.ok) onResolved(item.id);
        else { setOpen(true); setFeedback(result.error || 'El pendiente sigue activo en su origen.'); }
      } catch {
        setOpen(true);
        setFeedback('No fue posible verificar el pendiente. No se ha retirado de la lista.');
      }
    });
  };
  const acknowledge = () => {
    setFeedback('');
    start(async () => {
      const result = await acknowledgeFounderAction(item.id);
      if (result.ok) onResolved(item.id);
      else { setOpen(true); setFeedback(result.error); }
    });
  };
  useEffect(() => { if (open) heading.current?.focus(); }, [open]);
  if (item.incident) return <IncidentQuickCard incident={item.incident} saveAction={repairAction} onResolved={() => onResolved(item.id)} />;
  return <article className="min-w-0 px-3 py-4 sm:px-4" data-action-id={item.id}>
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]"><span className="mr-2 rounded border px-1.5 py-0.5 text-[10px] font-bold">{item.priority}</span><strong className="text-sm">{item.title}</strong><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted">{item.detail}</p></div>
      <div className="flex shrink-0 flex-wrap gap-2"><button className="min-h-11 rounded-xl border px-4 text-xs font-bold text-brand" type="button" aria-expanded={open} aria-controls={`diagnostic-${item.id}`} disabled={pending} onClick={() => open ? setOpen(false) : inspect()}>{open ? 'CERRAR DIAGNÓSTICO' : 'REVISAR'}</button><button className="min-h-11 rounded-xl border border-success/40 px-4 text-xs font-bold text-success disabled:opacity-50" type="button" disabled={pending} onClick={acknowledge}>{pending ? 'GUARDANDO…' : 'YA LO REVISÉ'}</button></div>
    </div>
    {open ? <section id={`diagnostic-${item.id}`} className="mt-3 min-w-0 rounded-xl border border-brand/30 bg-background/50 p-4" aria-busy={pending}>
      <h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">Diagnóstico del pendiente</h3>
      {diagnostic ? <><dl className="mt-3 grid min-w-0 gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted">Evento</dt><dd className="mt-1 break-words">{diagnostic.event}</dd></div><div><dt className="text-xs text-muted">Caja</dt><dd className="mt-1">{diagnostic.box}</dd></div><div className="min-w-0 sm:col-span-2"><dt className="text-xs text-muted">Problema exacto</dt><dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{diagnostic.problem}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted">Cómo resolverlo</dt><dd className="mt-1 leading-6">{diagnostic.solution}</dd></div></dl><p className="mt-3 text-xs text-muted">{diagnostic.resolved ? 'La fuente confirma que está resuelto.' : 'Pendiente en la fuente actual.'}</p><div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{diagnostic.targets.map(target => <Link className="inline-flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold text-brand" key={target.href+target.label} href={target.href}>{target.label}</Link>)}<button type="button" className="min-h-11 rounded-xl border border-success/40 px-4 text-xs font-bold text-success disabled:opacity-50" disabled={pending} onClick={() => { setFeedback(''); start(async () => { const result = await validateAction([item.id]); if (result.diagnostics?.[0]) setDiagnostic(result.diagnostics[0]); if (result.ok) onResolved(item.id); else setFeedback(result.error); }); }}>{pending ? 'VALIDANDO…' : 'VALIDAR RESOLUCIÓN'}</button><button type="button" className="min-h-11 rounded-xl border px-3 text-xs" disabled={pending} onClick={inspect}>Actualizar diagnóstico</button></div></> : <p className="mt-3 text-sm">{pending ? 'Consultando el estado actual…' : 'No se pudo cargar el detalle.'}</p>}
      {feedback ? <p role="status" className="mt-3 text-sm text-warning">{feedback}</p> : null}
    </section> : null}
  </article>;
}
