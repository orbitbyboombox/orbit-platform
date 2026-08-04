"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  Gauge,
  Pause,
  Play,
  Printer,
  Square,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ProjectHeader, type ProjectHeaderProps } from "@/components/project/project-header";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProjectStatus } from "@/features/projects/domain";

type LiveEventStatus = "running" | "paused" | "finished";

export type LiveEventExperienceProps = Omit<ProjectHeaderProps, "status">;

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

const statusPresentation: Record<LiveEventStatus, { label: string; variant: "success" | "warning" | "neutral" }> = {
  running: { label: "En curso", variant: "success" },
  paused: { label: "Pausado", variant: "warning" },
  finished: { label: "Finalizado", variant: "neutral" },
};

export function LiveEventExperience(props: LiveEventExperienceProps) {
  const [status, setStatus] = useState<LiveEventStatus>("running");
  const [incidentReported, setIncidentReported] = useState(false);
  const finished = status === "finished";
  const paused = status === "paused";
  const currentStatus = statusPresentation[status];

  const recommendation = finished
    ? {
        actionLabel: "Cerrar proyecto",
        estimatedTime: "2 minutos",
        message: "Cerrar proyecto",
        action: () => undefined,
      }
    : incidentReported
      ? {
          actionLabel: "Revisar incidente",
          estimatedTime: "30 segundos",
          message: "Revisar el incidente reportado.",
          action: () => setIncidentReported(false),
        }
      : paused
        ? {
            actionLabel: "Reanudar evento",
            estimatedTime: "5 segundos",
            message: "El evento está pausado. Reanúdalo cuando el operador esté listo.",
            action: () => setStatus("running"),
          }
        : {
            actionLabel: "Continuar monitoreo",
            estimatedTime: "En vivo",
            message: "Todo está funcionando normalmente.",
            action: () => undefined,
          };

  return (
    <WorkspaceLayout
      bottomAction={
        <SmartCard
          description={finished ? "Siguiente experiencia recomendada · Cerrar proyecto" : "Controla la sesión de producción activa."}
          icon={finished ? <CheckCircle2 aria-hidden="true" className="size-5" /> : <Gauge aria-hidden="true" className="size-5" />}
          status={<StatusBadge label={finished ? "Evento completado" : currentStatus.label} variant={finished ? "success" : currentStatus.variant} />}
          title={finished ? "Evento completado" : "Acciones del evento"}
        >
          {finished ? (
            <p className="text-2xl font-semibold tracking-tight">Siguiente experiencia recomendada · Cerrar proyecto</p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {paused ? (
                <ActionButton label="Reanudar evento" onClick={() => setStatus("running")} type="button" />
              ) : (
                <Button className="gap-2" onClick={() => setStatus("paused")} type="button" variant="outline">
                  <Pause aria-hidden="true" className="size-4" /> Pausar evento
                </Button>
              )}
              <Button className="gap-2" onClick={() => setIncidentReported(true)} type="button" variant="outline">
                <AlertTriangle aria-hidden="true" className="size-4" /> Reportar incidente
              </Button>
              <Button className="gap-2 text-danger" onClick={() => setStatus("finished")} type="button" variant="outline">
                <Square aria-hidden="true" className="size-4" /> Finalizar evento
              </Button>
            </div>
          )}
        </SmartCard>
      }
      copilot={
        <OrbitCopilot
          actionLabel={recommendation.actionLabel}
          estimatedTime={recommendation.estimatedTime}
          onAction={recommendation.action}
          recommendation={recommendation.message}
          title="ORBIT LIVE"
        />
      }
      header={<ProjectHeader {...props} status={finished ? ProjectStatus.DELIVERY : ProjectStatus.EVENT} />}
      mainContent={
        <div className="grid gap-4 sm:grid-cols-2">
          <SmartCard
            icon={finished ? <CheckCircle2 aria-hidden="true" className="size-5" /> : paused ? <Pause aria-hidden="true" className="size-5" /> : <Play aria-hidden="true" className="size-5" />}
            primaryValue={currentStatus.label}
            secondaryValue={finished ? "La producción del evento terminó" : paused ? "El temporizador está pausado" : "Producción en vivo en curso"}
            status={<StatusBadge label={currentStatus.label} variant={currentStatus.variant} />}
            title="Estado en vivo"
          />

          <SmartCard
            icon={<UserRound aria-hidden="true" className="size-5" />}
            primaryValue="Valentina Rojas"
            secondaryValue="+56 9 5555 0128"
            status={<StatusBadge label={finished ? "Completado" : "En terreno"} variant="success" />}
            title="Operador"
          >
            <dl className="divide-y">
              <DetailRow label="Hora de llegada" value="18:12" />
              <DetailRow label="Estado" value={finished ? "Turno completado" : "Operando"} />
            </dl>
          </SmartCard>

          <SmartCard
            icon={<Camera aria-hidden="true" className="size-5" />}
            primaryValue="Cabina Classic"
            secondaryValue="Equipamiento de producción asignado"
            status={<StatusBadge label={finished ? "Desconectado" : "Operativo"} variant={finished ? "neutral" : "success"} />}
            title="Equipamiento"
          >
            <dl className="divide-y">
              <DetailRow label="Cámara" value="Sony A7 IV" />
              <DetailRow label="Impresora" value="DNP RX1HS" />
              <DetailRow label="Estado actual" value={finished ? "Sesión finalizada" : paused ? "En espera" : "Activo"} />
            </dl>
          </SmartCard>

          <SmartCard
            className="sm:row-span-2"
            icon={<Gauge aria-hidden="true" className="size-5" />}
            primaryValue={finished ? "Totales del evento" : "Métricas en vivo"}
            secondaryValue="Valores temporales de demostración"
            status={<StatusBadge label={finished ? "Final" : "En vivo"} variant={finished ? "neutral" : "info"} />}
            title="Métricas del evento"
          >
            <dl className="divide-y">
              <DetailRow label="Fotos impresas" value="184" />
              <DetailRow label="Fotos digitales" value="247" />
              <DetailRow label="Papel restante" value="316 hojas" />
              <DetailRow label="Tiempo transcurrido" value={finished ? "03:42:18" : paused ? "02:16:42 pausado" : "02:16:42"} />
              <DetailRow label="Invitados atendidos" value="126" />
            </dl>
          </SmartCard>

          <SmartCard
            icon={<Printer aria-hidden="true" className="size-5" />}
            primaryValue={incidentReported ? "Incidente reportado" : "Sistemas normales"}
            secondaryValue={incidentReported ? "Esperando revisión del operador" : "Cámara e impresora responden correctamente"}
            status={<StatusBadge label={incidentReported ? "Atención" : "Saludable"} variant={incidentReported ? "warning" : "success"} />}
            title="Salud de producción"
          />

          <SmartCard
            icon={<Clock3 aria-hidden="true" className="size-5" />}
            primaryValue="19:00"
            secondaryValue="La producción comenzó a tiempo"
            title="Inicio del evento"
          />
        </div>
      }
      timeline={null}
    />
  );
}
