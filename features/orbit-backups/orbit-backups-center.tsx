"use client";

import { useTransition, useState } from "react";
import { CheckCircle2, Clock3, HardDrive, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startOrbitBackupAction } from "./actions";
import type { OrbitBackupRun } from "./types";

const formatBytes = (value: number | null) => value == null ? "—" : `${new Intl.NumberFormat("es-CL").format(value)} bytes`;
const statusLabel = (status: OrbitBackupRun["status"]) => status === "EN_PROCESO" ? "EN PROCESO" : status;

export function OrbitBackupsCenter({ runs }: { runs: OrbitBackupRun[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const active = runs.some((run) => run.status === "EN_PROCESO");
  const start = () => startTransition(async () => {
    const result = await startOrbitBackupAction();
    setMessage(result.ok ? "Respaldo iniciado. Esta pantalla se actualizará cuando GitHub confirme el resultado." : result.error);
    if (result.ok) window.setTimeout(() => window.location.reload(), 3000);
  });
  return <section id="orbit-backups" className="rounded-3xl border bg-card p-5 sm:p-7">
    <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-4"><span className="rounded-2xl border bg-background p-3 text-brand"><HardDrive className="size-6" /></span><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Founder / Administración</p><h2 className="mt-1 text-2xl font-semibold">RESPALDOS ORBIT</h2><p className="mt-1 max-w-2xl text-sm text-muted">PostgreSQL, Auth, Storage y referencia del código, cifrados y verificados en la carpeta privada de Google Drive.</p></div></div>
      <Button onClick={start} disabled={pending || active} loading={pending} loadingLabel="Iniciando...">RESPALDAR AHORA</Button>
    </header>
    <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border p-4"><p className="text-xs text-muted">Automático</p><p className="mt-1 font-semibold">Diario</p></div><div className="rounded-2xl border p-4"><p className="text-xs text-muted">Retención</p><p className="mt-1 font-semibold">30 días</p></div><div className="rounded-2xl border p-4"><p className="text-xs text-muted">Seguridad</p><p className="mt-1 font-semibold">Cifrado + SHA-256</p></div></div>
    {message && <p role="status" className="mt-4 rounded-xl border border-brand/30 bg-brand/5 p-3 text-sm">{message}</p>}
    <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted"><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Archivos</th><th className="px-3 py-3">Tamaño</th><th className="px-3 py-3">Evidencia</th><th className="px-3 py-3">Error</th></tr></thead><tbody>{runs.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-muted">Aún no hay ejecuciones registradas.</td></tr> : runs.map((run) => <tr className="border-b last:border-0" key={run.id}><td className="px-3 py-3">{new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(run.requested_at))}</td><td className="px-3 py-3"><span className="inline-flex items-center gap-2 font-semibold">{run.status === "COMPLETO" ? <CheckCircle2 className="size-4 text-emerald-600" /> : run.status === "ERROR" ? <XCircle className="size-4 text-red-600" /> : <Clock3 className="size-4 text-amber-600" />}{statusLabel(run.status)}</span></td><td className="px-3 py-3">{run.file_count ?? "—"}</td><td className="px-3 py-3">{formatBytes(run.total_bytes)}</td><td className="px-3 py-3">{run.workflow_url ? <a className="text-brand underline" href={run.workflow_url} target="_blank" rel="noreferrer">Ver ejecución</a> : "—"}</td><td className="max-w-sm px-3 py-3 text-xs text-muted">{run.error_message ?? "—"}</td></tr>)}</tbody></table></div>
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" /><p>Las copias válidas no se sobrescriben. La rotación mueve a papelera únicamente carpetas de respaldo con más de 30 días después de verificar la nueva copia.</p></div>
  </section>;
}
