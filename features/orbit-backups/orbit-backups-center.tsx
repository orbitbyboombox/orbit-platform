"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startOrbitBackupAction } from "./actions";
import type { OrbitBackupRun, OrbitBackupStatus } from "./types";

const labels: Record<OrbitBackupStatus, string> = {
  PENDIENTE: "Pendiente", EN_PROCESO: "Ejecutando", COMPLETO: "Completado",
  VERIFICADO: "Verificado", ERROR: "Fallido",
};
const date = new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" });
const number = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

export function OrbitBackupsCenter({ runs, ready }: { runs: OrbitBackupRun[]; ready: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const active = runs.some(run => ["PENDIENTE", "EN_PROCESO", "COMPLETO"].includes(run.status));
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [active, router]);

  return <section className="space-y-5 rounded-3xl border bg-card p-5 sm:p-7">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><HardDrive aria-hidden="true" className="mb-2 size-6 text-brand" />
        <h1 className="text-2xl font-semibold">Centro de Respaldos Premium</h1>
        <p className="mt-1 text-sm text-muted">PostgreSQL, Auth y Storage. Copias cifradas con SHA-256 en ORBIT BACKUPS - PRIVATE.</p>
      </div>
      <Button disabled={pending || active || !ready} loading={pending} onClick={() => startTransition(async () => {
        const result = await startOrbitBackupAction();
        setMessage(result.ok ? "Solicitud registrada. El historial mostrará el resultado de GitHub." : result.error);
        router.refresh();
      })}>Crear copia de seguridad</Button>
    </header>
    <p className="text-sm text-muted">Programación diaria a las 03:00 de Chile.</p>
    {!ready && <p role="status" className="text-sm text-warning">El disparador seguro aún no está disponible.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
      <thead className="border-b text-muted"><tr>{["Fecha", "Estado", "Tamaño", "Versión", "Destino", "Ejecución"].map(name => <th scope="col" key={name} className="p-3">{name}</th>)}</tr></thead>
      <tbody>{runs.length === 0 ? <tr><td colSpan={6} className="p-3">Aún no hay ejecuciones registradas.</td></tr> : runs.map(run => (
        <tr key={run.id} className="border-b align-top last:border-0">
          <td className="p-3">{date.format(new Date(run.requested_at))}</td>
          <td className="p-3"><strong>{labels[run.status]}</strong>{run.error_message && <p className="mt-1 text-xs text-muted">{run.error_message}</p>}</td>
          <td className="p-3">{run.total_bytes == null ? "—" : `${number.format(run.total_bytes / 1048576)} MiB`}</td>
          <td className="p-3">{run.source_sha?.slice(0, 8) ?? "—"}</td>
          <td className="p-3">{run.drive_folder_id && /^[A-Za-z0-9_-]+$/.test(run.drive_folder_id)
            ? <a className="text-brand underline" href={`https://drive.google.com/drive/folders/${run.drive_folder_id}`}>Drive privado</a> : "—"}</td>
          <td className="p-3">{run.github_run_id
            ? <a className="text-brand underline" href={`https://github.com/orbitbyboombox/orbit-platform/actions/runs/${run.github_run_id}`}>Ver en GitHub</a> : "—"}</td>
        </tr>
      ))}</tbody>
    </table></div>
  </section>;
}
