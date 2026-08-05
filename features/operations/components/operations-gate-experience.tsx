"use client";

import { useState } from "react";
import {
  BadgeCheck,
  Ban,
  CirclePause,
  CreditCard,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ProjectHeader, type ProjectHeaderProps } from "@/components/project/project-header";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge, type StatusBadgeProps } from "@/components/ui/status-badge";
import { ProjectStatus } from "@/features/projects/domain";
import { ProjectEventType, ProjectState } from "@/features/projects/engine";
import { approveReservationAtOperationsGate } from "../application";

export type OperationsGateExperienceProps = Omit<ProjectHeaderProps, "status"> & {
  projectId?: string;
};

type GateDecision = "PENDING" | "APPROVED" | "REJECTED" | "PROOF_REQUESTED" | "PAUSED";

interface GateCardProps {
  title: string;
  value: string;
  description: string;
  variant: StatusBadgeProps["variant"];
  icon: React.ReactNode;
}

export function OperationsGateExperience({ projectId = "mock-project", ...props }: OperationsGateExperienceProps) {
  const [decision, setDecision] = useState<GateDecision>("PENDING");
  const [projectState, setProjectState] = useState(ProjectState.RESERVED);
  const [transitionEvent, setTransitionEvent] = useState<ProjectEventType>();
  const confirmed = projectState === ProjectState.CONFIRMED;

  const approve = () => {
    const result = approveReservationAtOperationsGate({
      projectId,
      currentState: projectState,
      evidence: {
        agreementAccepted: true,
        paymentApproved: true,
        proofValidated: true,
        portalActive: true,
      },
    });

    if (!result.success) return;
    setProjectState(result.transition.state);
    setTransitionEvent(result.transition.events[0]?.type);
    setDecision("APPROVED");
  };

  const decisionCopy = getDecisionCopy(decision);

  return <WorkspaceLayout
    className="max-w-none p-0"
    header={<ProjectHeader {...props} stageLabel={confirmed ? "Proyecto confirmado" : "Operations Gate"} status={confirmed ? ProjectStatus.CONFIRMED : ProjectStatus.RESERVATION_READY} />}
    copilot={<OrbitCopilot actionLabel={confirmed ? "Ver proyecto confirmado" : "Aprobar reserva"} estimatedTime={confirmed ? "Listo" : "30 segundos"} impact={confirmed ? "El proyecto puede prepararse para futuras automatizaciones." : "Solo esta aprobación permite confirmar oficialmente el proyecto."} onAction={confirmed ? undefined : approve} reason={confirmed ? "La reserva fue aprobada por BOOMBOX." : "Contrato, pago, comprobante y portal están listos."} recommendation={confirmed ? "Proyecto confirmado" : decision === "PENDING" ? "Reserva lista para aprobar" : decisionCopy.recommendation} title="Decisión BOOMBOX" />}
    mainContent={<div className="space-y-8"><section aria-labelledby="operations-approval"><div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Punto oficial de aprobación</p><h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" id="operations-approval">Operations Gate</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-muted">BOOMBOX revisa toda la evidencia antes de permitir que la reserva se convierta en un proyecto confirmado.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><GateCard description="Solicitud recibida desde el Portal del Cliente" icon={<ShieldCheck aria-hidden="true" className="size-5" />} title="Estado de reserva" value={confirmed ? "Aprobada" : "Lista para aprobación"} variant={confirmed ? "success" : "warning"} /><GateCard description="Abono y comprobante revisados" icon={<CreditCard aria-hidden="true" className="size-5" />} title="Estado del pago" value="Pago aprobado" variant="success" /><GateCard description="Aceptación registrada por el cliente" icon={<FileCheck2 aria-hidden="true" className="size-5" />} title="Estado del contrato" value="Acuerdo aceptado" variant="success" /><GateCard description="Enlace permanente activo" icon={<UserRoundCheck aria-hidden="true" className="size-5" />} title="Estado del portal" value="Portal activo" variant="info" /><GateCard description={decisionCopy.description} icon={<BadgeCheck aria-hidden="true" className="size-5" />} title="Estado de aprobación" value={decisionCopy.label} variant={decisionCopy.variant} /></div></section>{confirmed && <SmartCard className="border-success/20 bg-success/5" icon={<BadgeCheck aria-hidden="true" className="size-5 text-success" />} primaryValue="Proyecto confirmado" secondaryValue="La transición oficial RESERVED → CONFIRMED fue aceptada por Project State Machine." status={<StatusBadge label="Listo para automatizaciones futuras" variant="success" />} title="Aprobación completada"><div className="flex flex-wrap gap-3 text-sm text-muted"><span>Evento emitido:</span><code className="rounded bg-accent px-2 py-1 text-foreground">{transitionEvent ?? ProjectEventType.PROJECT_CONFIRMED}</code></div></SmartCard>}</div>}
    timeline={null}
    bottomAction={<div className="grid gap-2 rounded-2xl border bg-card/95 p-4 shadow-xl backdrop-blur sm:grid-cols-2 xl:grid-cols-4"><ActionButton disabled={confirmed} icon={BadgeCheck} label="Aprobar Reserva" onClick={approve} /><ActionButton disabled={confirmed} icon={Ban} label="Rechazar Reserva" onClick={() => setDecision("REJECTED")} variant="outline" /><ActionButton disabled={confirmed} icon={RefreshCw} label="Solicitar nuevo comprobante" onClick={() => setDecision("PROOF_REQUESTED")} variant="outline" /><ActionButton disabled={confirmed} icon={CirclePause} label="Pausar Reserva" onClick={() => setDecision("PAUSED")} variant="outline" /></div>}
  />;
}

function GateCard({ title, value, description, variant, icon }: GateCardProps) {
  return <SmartCard icon={icon} primaryValue={value} secondaryValue={description} status={<StatusBadge label={value} variant={variant} />} title={title} />;
}

function getDecisionCopy(decision: GateDecision): { label: string; description: string; recommendation: string; variant: StatusBadgeProps["variant"] } {
  if (decision === "APPROVED") return { label: "Reserva aprobada", description: "Proyecto confirmado por BOOMBOX", recommendation: "Proyecto confirmado", variant: "success" };
  if (decision === "REJECTED") return { label: "Reserva rechazada", description: "La reserva requiere revisión comercial", recommendation: "Revisar rechazo", variant: "danger" };
  if (decision === "PROOF_REQUESTED") return { label: "Nuevo comprobante solicitado", description: "Esperando respuesta del cliente", recommendation: "Esperando comprobante", variant: "warning" };
  if (decision === "PAUSED") return { label: "Reserva pausada", description: "No se ejecutarán cambios mientras esté pausada", recommendation: "Esperando decisión de BOOMBOX", variant: "neutral" };
  return { label: "Pendiente de aprobación", description: "Toda la evidencia está lista para revisar", recommendation: "Reserva lista para aprobar", variant: "warning" };
}
