"use client";

import { CalendarSync } from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SyncRequest, SyncStatus } from "../types";

const statusPresentation: Record<
  SyncStatus,
  {
    label: string;
    recommendation: string;
    reason: string;
    impact: string;
    actionLabel: string;
    variant: "neutral" | "info" | "success";
  }
> = {
  PENDING: {
    label: "Pendiente",
    recommendation: "Sincronización pendiente",
    reason: "La solicitud operacional aún no está lista para ser consumida.",
    impact: "Las integraciones futuras permanecerán en espera.",
    actionLabel: "Revisar sincronización",
    variant: "neutral",
  },
  READY: {
    label: "Lista",
    recommendation: "Proyecto listo para sincronizar",
    reason: "La solicitud operacional contiene la información requerida.",
    impact: "Las integraciones podrán procesarla cuando estén disponibles.",
    actionLabel: "Esperando integración",
    variant: "info",
  },
  COMPLETED: {
    label: "Completada",
    recommendation: "Sincronización completada",
    reason: "La solicitud operacional terminó su ciclo de sincronización.",
    impact: "No existen acciones de sincronización pendientes.",
    actionLabel: "Ver sincronización",
    variant: "success",
  },
};

export interface OperationsSyncWorkspaceProps {
  request: SyncRequest;
  onAction?: () => void;
}

export function OperationsSyncWorkspace({ request, onAction }: OperationsSyncWorkspaceProps) {
  const presentation = statusPresentation[request.status];

  return (
    <section aria-labelledby="operations-sync-title" className="space-y-6">
      <SmartCard
        icon={<CalendarSync aria-hidden="true" className="size-5" />}
        primaryValue={presentation.label}
        secondaryValue={`${request.eventDate} · ${request.startTime}–${request.endTime}`}
        status={<StatusBadge label={presentation.label} variant={presentation.variant} />}
        title="Sincronización operacional"
      >
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Solicitud</dt>
            <dd className="mt-1 font-medium">{request.id}</dd>
          </div>
          <div>
            <dt className="text-muted">Ubicación</dt>
            <dd className="mt-1 font-medium">{request.location}</dd>
          </div>
        </dl>
      </SmartCard>

      <div id="operations-sync-title">
        <OrbitCopilot
          actionLabel={presentation.actionLabel}
          estimatedTime="30 segundos"
          impact={presentation.impact}
          onAction={onAction}
          reason={presentation.reason}
          recommendation={presentation.recommendation}
          title="Sincronización operacional"
        />
      </div>
    </section>
  );
}
