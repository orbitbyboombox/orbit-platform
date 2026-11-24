"use client";

import { useState } from "react";
import { verifyHistoricalDocumentIntegrityAction } from "@/features/connectors/google-drive/actions/document-backup-repair.actions";

type Doc = { id: string };
type Result = { documentId: string; status: "SYNCED" | "REQUIRES_REVIEW"; reason?: string };

export function DriveHistoricalIntegrity({ documents }: { documents: Doc[] }) {
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [outcomes, setOutcomes] = useState<Result[]>([]);
  const [done, setDone] = useState(false);
  const [activeId, setActiveId] = useState("");

  async function run() {
    if (running || !documents.length) return;
    setRunning(true);
    setProcessed(0);
    setOutcomes([]);
    setDone(false);
    const results: Result[] = [];
    for (const doc of documents) {
      setActiveId(doc.id);
      try {
        results.push(await verifyHistoricalDocumentIntegrityAction(doc.id));
      } catch (error) {
        results.push({ documentId: doc.id, status: "REQUIRES_REVIEW",
          reason: error instanceof Error ? error.message : "Falló la verificación del archivo." });
      }
      setOutcomes([...results]);
      setProcessed(results.length);
    }
    setActiveId("");
    setRunning(false);
    setDone(true);
  }

  const synced = outcomes.filter((x) => x.status === "SYNCED").length;
  const exceptions = outcomes.filter((x) => x.status !== "SYNCED");
  return <section className="space-y-3 rounded-2xl border bg-card p-6">
    <h2 className="text-lg font-semibold">Integridad de documentos históricos</h2>
    <p className="text-sm text-muted">Se comparan los bytes de cada documento en Supabase Storage y Google Drive con el SHA-256 registrado. Solo un resultado idéntico se marca SYNCED. No se modifica ningún archivo ni checksum.</p>
    <p className="text-sm font-medium">{documents.length} documentos pendientes de validación criptográfica.</p>
    <button type="button" disabled={running || !documents.length} onClick={run}
      className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50">
      {running ? `Verificando ${processed} de ${documents.length}…` : `Verificar integridad histórica (${documents.length})`}
    </button>
    {(running || done) && <div role="status" aria-live="polite" className="space-y-2 text-sm">
      <progress className="w-full" max={Math.max(1,documents.length)} value={processed}/>
      <p>{processed} procesados: <strong>{synced}</strong> íntegros y sincronizados; <strong>{exceptions.length}</strong> requieren revisión.</p>
      {activeId && <p className="text-muted">Documento: {activeId}</p>}
      {done && <p className="text-muted">Actualiza esta página para ver los nuevos estados.</p>}
    </div>}
    {exceptions.length > 0 && <div className="rounded-xl border p-3 text-sm">
      <h3 className="font-semibold">Excepciones — sin cambios al original</h3>
      <ul className="mt-2 space-y-2">{exceptions.map((x) =>
        <li key={x.documentId} className="break-words"><code>{x.documentId}</code>: {x.reason}</li>
      )}</ul>
    </div>}
  </section>;
}
