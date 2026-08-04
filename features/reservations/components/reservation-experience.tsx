"use client";

import { Banknote, CalendarCheck2, CreditCard, FileSignature, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ProjectHeader, type ProjectHeaderProps } from "@/components/project/project-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProjectStatus } from "@/features/projects/domain";

export type ReservationExperienceProps = Omit<ProjectHeaderProps, "status">;

interface DetailRowProps {
  label: string;
  value: string;
  strong?: boolean;
}

function DetailRow({ label, value, strong }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "font-semibold" : "font-medium"}>{value}</dd>
    </div>
  );
}

export function ReservationExperience(props: ReservationExperienceProps) {
  const [reservationStarted, setReservationStarted] = useState(false);
  const [budgetComplete, setBudgetComplete] = useState(false);
  const [contractComplete, setContractComplete] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const reservationComplete = budgetComplete && contractComplete && paymentComplete;

  const decision = !reservationStarted
    ? { recommendation: "Preparar reserva", actionLabel: "Preparar reserva", action: () => setReservationStarted(true) }
    : !budgetComplete
      ? { recommendation: "Revisar presupuesto", actionLabel: "Aprobar presupuesto", action: () => setBudgetComplete(true) }
      : !contractComplete
        ? { recommendation: "Preparar contrato", actionLabel: "Abrir contrato", action: () => setContractComplete(true) }
        : !paymentComplete
          ? { recommendation: "Registrar abono", actionLabel: "Registrar abono", action: () => setPaymentComplete(true) }
          : { recommendation: "Reserva completada", actionLabel: "Ver confirmación", action: () => undefined };

  const reservationCenter = reservationStarted ? (
    <div className="grid gap-4 sm:grid-cols-2">
      <SmartCard
        actionLabel={budgetComplete ? undefined : "Aprobar presupuesto"}
        icon={<Banknote aria-hidden="true" className="size-5" />}
        onAction={() => setBudgetComplete(true)}
        primaryValue="$4,850"
        secondaryValue="Cotización actual"
        status={<StatusBadge label={budgetComplete ? "Aprobado" : "Pendiente"} variant={budgetComplete ? "success" : "warning"} />}
        title="Presupuesto"
      >
        <dl className="divide-y">
          <DetailRow label="Servicios" value="$4,200" />
          <DetailRow label="Extras" value="$350" />
          <DetailRow label="Transporte" value="$300" />
          <DetailRow label="Total" strong value="$4,850" />
        </dl>
      </SmartCard>

      <SmartCard
        actionLabel={contractComplete ? undefined : "Abrir contrato"}
        icon={<FileSignature aria-hidden="true" className="size-5" />}
        onAction={() => setContractComplete(true)}
        primaryValue={contractComplete ? "Firmado" : "Pendiente"}
        secondaryValue="Estado del contrato"
        status={<StatusBadge label={contractComplete ? "Firmado" : "Pendiente"} variant={contractComplete ? "success" : "warning"} />}
        title="Contrato"
      />

      <SmartCard
        actionLabel={paymentComplete ? undefined : "Registrar abono"}
        icon={<CreditCard aria-hidden="true" className="size-5" />}
        onAction={() => setPaymentComplete(true)}
        primaryValue="$1,500"
        secondaryValue="Abono"
        status={<StatusBadge label={paymentComplete ? "Pagado" : "Pendiente"} variant={paymentComplete ? "success" : "warning"} />}
        title="Pago"
      >
        <dl className="divide-y">
          <DetailRow label="Saldo pendiente" value="$3,350" />
          <DetailRow label="Estado del pago" value={paymentComplete ? "Abono pagado" : "Esperando abono"} />
        </dl>
      </SmartCard>

      <SmartCard
        icon={<ShieldCheck aria-hidden="true" className="size-5" />}
        primaryValue={reservationComplete ? "Reserva completada" : "En curso"}
        secondaryValue={reservationComplete ? "Proyecto listo" : "Completa presupuesto, contrato y pago"}
        status={<StatusBadge label={reservationComplete ? "Confirmado" : "Pendiente"} variant={reservationComplete ? "success" : "neutral"} />}
        title="Confirmación"
      />
    </div>
  ) : (
    <SmartCard
      actionLabel="Preparar reserva"
      icon={<CalendarCheck2 aria-hidden="true" className="size-5" />}
      onAction={() => setReservationStarted(true)}
      primaryValue="Centro de reservas"
      secondaryValue="Prepara presupuesto, contrato y abono en un flujo guiado."
      status={<StatusBadge label="Listo" variant="info" />}
      title="Decisión"
    />
  );

  return (
    <WorkspaceLayout
      bottomAction={
        <SmartCard
          icon={<ShieldCheck aria-hidden="true" className="size-5" />}
          primaryValue={reservationComplete ? "Reserva completada" : "Reserva en curso"}
          secondaryValue={reservationComplete ? "Estado del proyecto · Confirmado" : "Completa todos los requisitos de la reserva."}
          status={<StatusBadge label={reservationComplete ? "Confirmado" : "En curso"} variant={reservationComplete ? "success" : "info"} />}
          title="Estado de la reserva"
        />
      }
      copilot={
        <OrbitCopilot
          actionLabel={decision.actionLabel}
          estimatedTime="20 segundos"
          onAction={decision.action}
          recommendation={decision.recommendation}
        />
      }
      header={
        <ProjectHeader
          {...props}
          status={reservationComplete ? ProjectStatus.CONFIRMED : ProjectStatus.RESERVATION_READY}
        />
      }
      mainContent={reservationCenter}
      timeline={null}
    />
  );
}
