"use client";

import { useRouter } from "next/navigation";
import type { NOVACertificationRun } from "@/features/connectors/google-workspace/application/google-nova-core";

function labelStatus(status: string) {
  if (status === "PASS") return "ORBIT CERTIFICADO · PRODUCTION READY";
  if (status === "PENDING" || status === "RUNNING") return "CERTIFICACIÓN EN PROCESO";
  return "CERTIFICACIÓN FALLIDA";
}

export function ProductionCertificationStatus({ run }: { run: NOVACertificationRun | null }) {
  const router = useRouter();
  const checks = run?.checks ?? {};
  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6" data-certification-center>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Certification Center · NOVA</p>
          <h3 className="mt-2 text-xl font-semibold">{run ? labelStatus(run.status) : "Sin ejecuciones disponibles"}</h3>
          <p className="mt-1 text-sm text-muted">Tenant BOOMBOX · {run ? new Date(run.created_at).toLocaleString("es-CL") : "Aún no hay una ejecución"}</p>
        </div>
        <button type="button" onClick={() => router.refresh()} className="inline-flex min-h-11 items-center rounded-xl border border-brand/40 px-4 text-sm font-semibold text-brand hover:bg-brand/[.06]">ACTUALIZAR ESTADO</button>
      </div>
      {run ? <>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {["master_email_smoke", "google_refresh", "drive_root_name", "calendar_exists"].map((key) => <div className="rounded-xl border bg-background p-3" key={key}><p className="text-xs uppercase tracking-wide text-muted">{key.replaceAll("_", " ")}</p><p className={`mt-1 text-sm font-semibold ${checks[key]?.pass ? "text-emerald-400" : "text-red-400"}`}>{checks[key]?.pass ? "PASS" : "FAIL / PENDING"}</p></div>)}
        </div>
        <p className="mt-4 break-all text-xs text-muted">Último run: {run.id}{run.error_code ? ` · Error: ${run.error_code}` : ""}</p>
      </> : null}
    </div>
  );
}
