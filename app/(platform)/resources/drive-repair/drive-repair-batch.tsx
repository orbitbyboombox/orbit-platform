"use client";

import { useState } from "react";
import { repairPendingDocumentBackupsAction } from "@/features/connectors/google-drive/actions/document-backup-repair.actions";

type PendingDocument = { id: string };
type RepairOutcome = { id: string; status: string; reason?: string };

export function DriveRepairBatch({ documents }: { documents: PendingDocument[] }) {
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [results, setResults] = useState<RepairOutcome[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  async function run() {
    if (running || !documents.length) return;
    setRunning(true);
    setFinished(false);
    setCompleted(0);
    setResults([]);
    const outcomes: RepairOutcome[] = [];
    for (const document of documents) {
      setCurrent(document.id);
      try {
        const response = await repairPendingDocumentBackupsAction([document.id]);
        const result = response.find((item) => item.documentId === document.id);
        outcomes.push(result
          ? { id: document.id, status: result.status, reason: result.reason }
          : { id: document.id, status: "REQUIRES_REVIEW", reason: "La acción no devolvió resultado para este documento." });
      } catch (error) {
        outcomes.push({ id: document.id, status: "ERROR", reason: error instanceof Error ? error.message : "Error de comunicación con ORBIT." });
      }
      setResults([...outcomes]);
      setCompleted(outcomes.length);
    }
    setCurrent(null);
    setRunning(false);
    setFinished(true);
  }

  const synced = results.filter((item) => item.status === "SYNCED").length;
  const pendingReview = results.filter((item) => item.status !== "SYNCED");
  return <section className="space-y-3 rounded-2xl border bg-card p-6">
    <h2 className="text-lg font-semibold">Recuperación de documentos pendientes</h2>
    <p className="text-sm text-muted">Pendientes detectados: {documents.length}. Cada documento se valida y procesa por separado; la operación muestra su avance y los errores, sin borrar originales ni reemplazar otros archivos.</p>
    <button type="button" onClick={run} disabled={running || documents.length === 0}
      className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50">
      {running ? `Reparando ${completed} de ${documents.length}…`
        : documents.length ? `Reparar pendientes verificados (${documents.length})` : "Sin documentos pendientes"}
    </button>
    {(running || finished) && <div aria-live="polite" role="status" className="space-y-2 text-sm">
      <p>{running ? `En ejecución: ${completed} de ${documents.length} procesados.` : `Operación terminada: ${completed} procesados.`}</p>
      <progress className="w-full" max={Math.max(1, documents.length)} value={completed}/>
      <p><strong>{synced}</strong> sincronizados; <strong>{pendingReview.length}</strong> requieren revisión.</p>
      {current && <p className="text-muted">Verificando documento {current}…</p>}
      {finished && <p className="text-muted">Actualiza esta página para ver el total pendiente actualizado en Supabase.</p>}
    </div>}
    {pendingReview.length > 0 && <div className="space-y-2 rounded-xl border p-3 text-sm">
      <p className="font-semibold">Documentos que requieren revisión</p>
      <ul className="space-y-2">
        {pendingReview.map((item) => <li key={item.id} className="break-words">
          <code>{item.id}</code>: {item.reason || item.status}
        </li>)}
      </ul>
    </div>}
  </section>;
}
