"use client";

import { useState } from "react";
import { BadgeCheck, Banknote, CalendarCheck2, FileCheck2, ShieldCheck } from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ProjectHeader, type ProjectHeaderProps } from "@/components/project/project-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProjectStatus } from "@/features/projects/domain";
import { MOCK_RESERVATION } from "../data/mock-reservation";

export type ReservationExperienceProps = Omit<ProjectHeaderProps, "status">;

export function ReservationExperience(props: ReservationExperienceProps) {
  const [validationPrepared, setValidationPrepared] = useState(false);
  const recommendation = validationPrepared ? "Reserva lista para confirmar" : "Validar reserva";

  return <WorkspaceLayout
    header={<ProjectHeader {...props} status={ProjectStatus.RESERVATION_READY} />}
    copilot={<OrbitCopilot actionLabel="Confirmar reserva" estimatedTime="30 segundos" impact="Solo después de esta revisión la fecha podrá quedar oficialmente reservada." onAction={() => setValidationPrepared(true)} reason="El cliente adjuntó un comprobante y espera validación." recommendation={recommendation} title="Acción BOOMBOX" />}
    mainContent={<div className="grid gap-4 sm:grid-cols-2"><SmartCard icon={<CalendarCheck2 aria-hidden="true" className="size-5" />} primaryValue="Pendiente de validación" secondaryValue="La fecha aún no está oficialmente reservada." status={<StatusBadge label={validationPrepared ? "Revisión preparada" : "Pendiente"} variant={validationPrepared ? "info" : "warning"} />} title="Estado de la reserva" /><SmartCard icon={<Banknote aria-hidden="true" className="size-5" />} primaryValue={MOCK_RESERVATION.requiredDeposit} secondaryValue="Abono informado por el cliente" status={<StatusBadge label="Por validar" variant="warning" />} title="Resumen financiero"><dl className="space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted">Total</dt><dd className="font-semibold">{MOCK_RESERVATION.total}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted">Saldo restante</dt><dd className="font-semibold">{MOCK_RESERVATION.remainingBalance}</dd></div></dl></SmartCard><SmartCard icon={<FileCheck2 aria-hidden="true" className="size-5" />} primaryValue="Comprobante recibido" secondaryValue="Carga realizada desde el Portal del Cliente" status={<StatusBadge label="Recibido" variant="info" />} title="Comprobante" /><SmartCard icon={<ShieldCheck aria-hidden="true" className="size-5" />} primaryValue="Confirmar reserva" secondaryValue="Acción interna BOOMBOX · demostración UI" status={<StatusBadge label="Solo BOOMBOX" variant="neutral" />} title="Validación interna" /></div>}
    timeline={null}
    bottomAction={<SmartCard actionLabel="Confirmar reserva" icon={<BadgeCheck aria-hidden="true" className="size-5" />} onAction={() => setValidationPrepared(true)} primaryValue={validationPrepared ? "Validación preparada" : "Pendiente de validación"} secondaryValue={validationPrepared ? "Demostración UI: no se cambió el estado del proyecto." : "Revisa el comprobante antes de continuar."} status={<StatusBadge label={validationPrepared ? "Lista para confirmar" : "Acción requerida"} variant={validationPrepared ? "success" : "warning"} />} title="Acción BOOMBOX" />}
  />;
}
