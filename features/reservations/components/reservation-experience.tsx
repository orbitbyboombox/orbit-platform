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
    ? { recommendation: "Prepare Reservation", actionLabel: "Prepare Reservation", action: () => setReservationStarted(true) }
    : !budgetComplete
      ? { recommendation: "Review Budget", actionLabel: "Approve Budget", action: () => setBudgetComplete(true) }
      : !contractComplete
        ? { recommendation: "Prepare Contract", actionLabel: "Open Contract", action: () => setContractComplete(true) }
        : !paymentComplete
          ? { recommendation: "Register Deposit", actionLabel: "Register Deposit", action: () => setPaymentComplete(true) }
          : { recommendation: "Reservation Completed", actionLabel: "View Confirmation", action: () => undefined };

  const reservationCenter = reservationStarted ? (
    <div className="grid gap-4 sm:grid-cols-2">
      <SmartCard
        actionLabel={budgetComplete ? undefined : "Approve Budget"}
        icon={<Banknote aria-hidden="true" className="size-5" />}
        onAction={() => setBudgetComplete(true)}
        primaryValue="$4,850"
        secondaryValue="Current quotation"
        status={<StatusBadge label={budgetComplete ? "Approved" : "Pending"} variant={budgetComplete ? "success" : "warning"} />}
        title="Budget"
      >
        <dl className="divide-y">
          <DetailRow label="Services" value="$4,200" />
          <DetailRow label="Extras" value="$350" />
          <DetailRow label="Transportation" value="$300" />
          <DetailRow label="Total" strong value="$4,850" />
        </dl>
      </SmartCard>

      <SmartCard
        actionLabel={contractComplete ? undefined : "Open Contract"}
        icon={<FileSignature aria-hidden="true" className="size-5" />}
        onAction={() => setContractComplete(true)}
        primaryValue={contractComplete ? "Signed" : "Pending"}
        secondaryValue="Contract status"
        status={<StatusBadge label={contractComplete ? "Signed" : "Pending"} variant={contractComplete ? "success" : "warning"} />}
        title="Contract"
      />

      <SmartCard
        actionLabel={paymentComplete ? undefined : "Register Deposit"}
        icon={<CreditCard aria-hidden="true" className="size-5" />}
        onAction={() => setPaymentComplete(true)}
        primaryValue="$1,500"
        secondaryValue="Deposit"
        status={<StatusBadge label={paymentComplete ? "Paid" : "Pending"} variant={paymentComplete ? "success" : "warning"} />}
        title="Payment"
      >
        <dl className="divide-y">
          <DetailRow label="Remaining balance" value="$3,350" />
          <DetailRow label="Payment status" value={paymentComplete ? "Deposit paid" : "Awaiting deposit"} />
        </dl>
      </SmartCard>

      <SmartCard
        icon={<ShieldCheck aria-hidden="true" className="size-5" />}
        primaryValue={reservationComplete ? "Reservation Completed" : "In progress"}
        secondaryValue={reservationComplete ? "Project Ready" : "Complete budget, contract, and payment"}
        status={<StatusBadge label={reservationComplete ? "Confirmed" : "Pending"} variant={reservationComplete ? "success" : "neutral"} />}
        title="Confirmation"
      />
    </div>
  ) : (
    <SmartCard
      actionLabel="Prepare Reservation"
      icon={<CalendarCheck2 aria-hidden="true" className="size-5" />}
      onAction={() => setReservationStarted(true)}
      primaryValue="Reservation Center"
      secondaryValue="Prepare the budget, contract, and deposit in one guided flow."
      status={<StatusBadge label="Ready" variant="info" />}
      title="Decision"
    />
  );

  return (
    <WorkspaceLayout
      bottomAction={
        <SmartCard
          icon={<ShieldCheck aria-hidden="true" className="size-5" />}
          primaryValue={reservationComplete ? "Reservation Completed" : "Reservation in progress"}
          secondaryValue={reservationComplete ? "Project Status · Confirmed" : "Complete all reservation requirements."}
          status={<StatusBadge label={reservationComplete ? "Confirmed" : "In progress"} variant={reservationComplete ? "success" : "info"} />}
          title="Reservation status"
        />
      }
      copilot={
        <OrbitCopilot
          actionLabel={decision.actionLabel}
          estimatedTime="20 seconds"
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
