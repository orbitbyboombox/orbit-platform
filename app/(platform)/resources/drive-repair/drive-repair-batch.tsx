"use client";

import { useState } from "react";
import { repairPendingDocumentBackupsAction, inspectOscarReceiptIntegrityAction, approveOscarReceiptIntegrityAction } from "@/features/connectors/google-drive/actions/document-backup-repair.actions";

type PendingDocument = { id: string };
type RepairOutcome = { id: string; status: string; reason?: string };

export function DriveRepairBatch({ documents }: { documents: PendingDocument[] }) {
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [results, setResults] = useState<RepairOutcome[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [inspection, setInspection] = useState<Awaited<ReturnType<typeof inspectOscarReceiptIntegrityAction>> | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [repairOutcome, setRepairOutcome] = useState("");
  const oscarPending = documents.some((document) => document.id === "95b5aca1-9d7a-402e-9410-49525fcdbb8e");

  async function inspectOriginal() {
    setReviewing(true);
    setReviewError("");
    setRepairOutcome("");
    setConfirmed(false);
    try { setInspection(await inspectOscarReceiptIntegrityAction()); }
    catch (error) { setReviewError(error instanceof Error ? error.message : "No se pudo inspeccionar el original."); }
    finally { setReviewing(false); }
  }

  async function approveOriginal() {
    if (!inspection || !confirmed || reviewing) return;
    setReviewing(true);
    setReviewError("");
    try {
      const result = await approveOscarReceiptIntegrityAction(inspection.actualSha256);
      setRepairOutcome(result.status === "SYNCED" ? "Comprobante vinculado correctamente a Drive." : result.reason ?? result.status);
      if (result.status === "SYNCED") setInspection(null);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "No se completó la validación.");
    } finally { setReviewing(false); }
  }

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
    {oscarPending && <div className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Oscar Ríos · Verificación excepcional de integridad</h3>
      <p className="text-sm text-muted">El PNG original existe en Storage, pero el SHA-256 guardado no coincide con sus bytes actuales. Para proteger la integridad del comprobante, revisa visualmente la imagen antes de aprobar cualquier corrección. La revisión no modifica pagos.</p>
      <button type="button" onClick={inspectOriginal} disabled={reviewing}
        className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-50">
        {reviewing ? "Verificando…" : "Inspeccionar archivo original"}
      </button>
      {inspection && <div className="space-y-3 text-sm">
        <p>Archivo: <strong>{inspection.filename}</strong> · {inspection.size.toLocaleString("es-CL")} bytes</p>
        <p className="break-all">SHA-256 registrado: <code>{inspection.recordedSha256}</code></p>
        <p className="break-all">SHA-256 del archivo original: <code>{inspection.actualSha256}</code></p>
        <p className="text-muted">Vista previa temporal (caduca en 2 minutos). Si no corresponde al comprobante esperado, NO apruebes.</p>
        <img src={inspection.previewUrl} alt="Vista previa del comprobante original de Oscar Ríos, solo para verificación administrativa" className="max-h-96 max-w-full rounded border object-contain"/>
        <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/>
          <span>Revisé el comprobante y confirmo que este PNG corresponde al documento original de Oscar Ríos. Autorizo reemplazar únicamente el checksum incorrecto, conservar el valor anterior en auditoría e intentar vincularlo a la carpeta original.</span>
        </label>
        <button type="button" onClick={approveOriginal} disabled={!confirmed || reviewing}
          className="rounded-lg bg-brand px-4 py-2 font-semibold text-black disabled:opacity-50">
          Confirmar integridad y reparar este comprobante
        </button>
      </div>}
      {reviewError && <p role="alert" className="text-sm text-red-500">{reviewError}</p>}
      {repairOutcome && <p role="status" className="text-sm">{repairOutcome}</p>}
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
