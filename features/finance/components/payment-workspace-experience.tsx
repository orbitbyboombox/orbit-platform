"use client";

import { useState } from "react";
import { BadgeCheck, Ban, FileCheck2, RefreshCw, WalletCards } from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ProjectHeader, type ProjectHeaderProps } from "@/components/project/project-header";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { calculateReservationDeposit, getPaymentMethodRule } from "@/features/business-core";
import { ProjectStatus } from "@/features/projects/domain";
import { MOCK_PAYMENT } from "../data/mock-payment";

export type PaymentWorkspaceExperienceProps = Omit<ProjectHeaderProps, "status">;

export function PaymentWorkspaceExperience(props: PaymentWorkspaceExperienceProps) {
  const [feedback, setFeedback] = useState("Pendiente de validación");
  const deposit = calculateReservationDeposit(MOCK_PAYMENT.reservationTotal);
  const remaining = MOCK_PAYMENT.reservationTotal.amount - deposit.amount;

  return <WorkspaceLayout
    header={<ProjectHeader {...props} status={ProjectStatus.RESERVATION_READY} />}
    copilot={<OrbitCopilot actionLabel="Validar pago" estimatedTime="30 segundos" impact="La reserva podrá continuar solo después de la revisión BOOMBOX." onAction={() => setFeedback("Pago aprobado")} reason="El comprobante fue adjuntado por el cliente." recommendation="Validar pago" title="Acción BOOMBOX" />}
    mainContent={<div className="grid gap-4 sm:grid-cols-2"><SmartCard icon={<WalletCards aria-hidden="true" className="size-5" />} primaryValue={getPaymentMethodRule("BANK_TRANSFER").name} secondaryValue="Método de pago" status={<StatusBadge label="Sin cargo" variant="success" />} title="Pago" /><SmartCard icon={<BadgeCheck aria-hidden="true" className="size-5" />} primaryValue={formatClp(deposit.amount)} secondaryValue="Abono requerido" title="Montos"><dl className="mt-4 text-sm"><div className="flex justify-between"><dt className="text-muted">Saldo pendiente</dt><dd className="font-semibold">{formatClp(remaining)}</dd></div></dl></SmartCard><SmartCard icon={<FileCheck2 aria-hidden="true" className="size-5" />} primaryValue="Comprobante adjunto" secondaryValue="Estado del comprobante" status={<StatusBadge label="Recibido" variant="info" />} title="Comprobante" /><SmartCard icon={<BadgeCheck aria-hidden="true" className="size-5" />} primaryValue={feedback} secondaryValue="Estado de validación" status={<StatusBadge label="Solo BOOMBOX" variant="warning" />} title="Validación" /></div>}
    timeline={null}
    bottomAction={<div className="grid gap-2 rounded-2xl border bg-card/95 p-4 shadow-xl backdrop-blur sm:grid-cols-3"><ActionButton icon={BadgeCheck} label="Validar Pago" onClick={() => setFeedback("Pago aprobado")} /><ActionButton icon={Ban} label="Rechazar Pago" onClick={() => setFeedback("Pago rechazado")} variant="outline" /><ActionButton icon={RefreshCw} label="Solicitar nuevo comprobante" onClick={() => setFeedback("Nuevo comprobante solicitado")} variant="outline" /></div>}
  />;
}

function formatClp(amount: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}
