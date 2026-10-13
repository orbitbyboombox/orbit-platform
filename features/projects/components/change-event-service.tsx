"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeEventContractedServiceAction } from "./change-event-service.actions";

const SERVICES = [
  ["CLASSIC", "Classic"], ["POLAROID", "Polaroid"], ["BLACK_STUDIO", "Black Studio"],
  ["BBOX360", "BBOX360"], ["HASHTAG", "Hashtag"], ["INSTABOX", "Instabox"],
  ["VIDEO_LOUNGE", "Video Lounge"],
] as const;

export function ChangeEventService({ projectId, current, status, serviceCount }: {
  projectId: string; current: string; status: string; serviceCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [service, setService] = useState(current);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const locked = ["COMPLETED","FINISHED","CANCELLED","CANCELED","ARCHIVED"].includes(status.toUpperCase());
  if (serviceCount !== 1 || locked || !SERVICES.some(([code]) => code === current)) return null;
  return (
    <div className="mt-3 border-t pt-3">
      <button type="button" className="rounded-lg border px-3 py-2 text-sm font-medium text-brand" onClick={() => setOpen(!open)}>
        {open ? "Cancelar edición" : "Cambiar servicio contratado"}
      </button>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl border p-4">
          <label className="block text-sm">Nuevo servicio
            <select className="mt-1 w-full rounded-lg border bg-background p-2" value={service} onChange={(e) => setService(e.target.value)}>
              {SERVICES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Motivo del cambio
            <textarea className="mt-1 w-full rounded-lg border bg-background p-2" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <p className="text-xs text-muted">Se conserva el valor pactado, los pagos y los documentos. La disponibilidad, los equipos y cualquier anexo al contrato deben revisarse antes de confirmar. Los eventos con asignaciones activas se bloquean para evitar daños.</p>
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          <button type="button" disabled={pending || service === current || reason.trim().length < 5}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => {
              if (!window.confirm(`¿Cambiar ${current} por ${service} sin modificar el precio, los pagos ni los contratos firmados? Comprueba antes la disponibilidad del nuevo equipo.`)) return;
              setError("");
              startTransition(async () => {
                const result = await changeEventContractedServiceAction({ projectId, service, reason });
                if (!result.ok) { setError(result.error); return; }
                setOpen(false); router.refresh();
              });
            }}>{pending ? "Guardando..." : "Confirmar cambio"}</button>
        </div>
      )}
    </div>
  );
}
