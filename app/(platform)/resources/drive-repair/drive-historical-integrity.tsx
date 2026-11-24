"use client";

import { useState } from "react";
import { verifyHistoricalDocumentIntegrityAction, restoreHistoricalMissingDriveDocumentAction } from "@/features/connectors/google-drive/actions/document-backup-repair.actions";

type Doc = { id: string };
type Result = { documentId: string; status: "SYNCED" | "REQUIRES_REVIEW"; reason?: string };

export function DriveHistoricalIntegrity({ documents, legacyMissing }: { documents: Doc[]; legacyMissing: boolean }) {
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [outcomes, setOutcomes] = useState<Result[]>([]);
  const [done, setDone] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [restoringLegacy, setRestoringLegacy] = useState(false);
  const [legacyOutcome, setLegacyOutcome] = useState("");
  async function restoreLegacy() {
    if (restoringLegacy || running) return;
    setRestoringLegacy(true);
    setLegacyOutcome("");
    try {
      const result = await restoreHistoricalMissingDriveDocumentAction();
      setLegacyOutcome(result.status === "SYNCED" ? "Documento 2016 recuperado, SHA-256 confirmado y nuevo vínculo registrado." : "La restauración requiere revisión.");
    } catch (error) { setLegacyOutcome(error instanceof Error ? error.message : "No fue posible restaurar el documento histórico."); }
    finally { setRestoringLegacy(false); }
  }

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
    {legacyMissing && <div className="space-y-2 rounded-xl border p-4 text-sm">
      <h3 className="font-semibold">Documento histórico 2016 · enlace 404</h3>
      <p>Restauración excepcional en la carpeta ya existente 09_HISTORICO_POR_CONCILIAR. Conserva la referencia al enlace antiguo y compara los bytes originales con la copia nueva por SHA-256; no crea una segunda estructura ni sobrescribe archivos.</p>
      <button type="button" disabled={running || restoringLegacy} onClick={restoreLegacy} className="rounded-xl border px-4 py-2 font-semibold disabled:opacity-50">{restoringLegacy ? "Verificando y restaurando…" : "Recuperar documento histórico 2016"}</button>
      {legacyOutcome && <p role="status" className="break-words">{legacyOutcome}</p>}
    </div>}
    {exceptions.length > 0 && <div className="rounded-xl border p-3 text-sm">
      <h3 className="font-semibold">Excepciones — sin cambios al original</h3>
      <ul className="mt-2 space-y-2">{exceptions.map((x) =>
        <li key={x.documentId} className="break-words"><code>{x.documentId}</code>: {x.reason}</li>
      )}</ul>
    </div>}
  </section>;
}
