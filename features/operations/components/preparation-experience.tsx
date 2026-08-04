"use client";

import { Camera, CarFront, CheckCircle2, ClipboardCheck, PackageCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { SmartCard } from "@/components/cards/smart-card";
import { OrbitCopilot } from "@/components/copilot/orbit-copilot";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { ProjectHeader, type ProjectHeaderProps } from "@/components/project/project-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProjectStatus } from "@/features/projects/domain";

const checklistItems = [
  "Internet Connection",
  "Printer Test",
  "Camera Test",
  "Paper Loaded",
  "Template Approved",
  "Staff Confirmed",
] as const;

type ChecklistItem = (typeof checklistItems)[number];
type ChecklistState = Record<ChecklistItem, boolean>;

const initialChecklist = Object.fromEntries(
  checklistItems.map((item) => [item, false]),
) as ChecklistState;

export type PreparationExperienceProps = Omit<ProjectHeaderProps, "status">;

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

export function PreparationExperience(props: PreparationExperienceProps) {
  const [operatorAssigned, setOperatorAssigned] = useState(false);
  const [equipmentAssigned, setEquipmentAssigned] = useState(false);
  const [vehicleAssigned, setVehicleAssigned] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistState>(initialChecklist);

  const completedChecklistItems = checklistItems.filter((item) => checklist[item]).length;
  const completedRequirements = Number(operatorAssigned) + Number(equipmentAssigned) + Number(vehicleAssigned) + completedChecklistItems;
  const preparationScore = Math.round((completedRequirements / (checklistItems.length + 3)) * 100);
  const checklistComplete = completedChecklistItems === checklistItems.length;
  const preparationComplete = operatorAssigned && equipmentAssigned && vehicleAssigned && checklistComplete;
  const nextChecklistItem = checklistItems.find((item) => !checklist[item]);

  const toggleChecklistItem = (item: ChecklistItem) => {
    setChecklist((current) => ({ ...current, [item]: !current[item] }));
  };

  const decision = !operatorAssigned
    ? {
        recommendation: "Assign Operator",
        reason: "No operator has been assigned.",
        impact: "The event cannot move to Production.",
        actionLabel: "Assign Operator",
        action: () => setOperatorAssigned(true),
      }
    : !equipmentAssigned
      ? {
          recommendation: "Assign Equipment",
          reason: "The production kit is not assigned.",
          impact: "Equipment readiness cannot be verified.",
          actionLabel: "Assign Equipment",
          action: () => setEquipmentAssigned(true),
        }
      : !vehicleAssigned
        ? {
            recommendation: "Assign Vehicle",
            reason: "Transport has not been assigned.",
            impact: "The team cannot depart for the venue.",
            actionLabel: "Assign Vehicle",
            action: () => setVehicleAssigned(true),
          }
        : nextChecklistItem
          ? {
              recommendation: `Complete ${nextChecklistItem}`,
              reason: `${nextChecklistItem} is still pending.`,
              impact: "Preparation cannot be marked complete.",
              actionLabel: "Mark Complete",
              action: () => toggleChecklistItem(nextChecklistItem),
            }
          : {
              recommendation: "Start Event",
              reason: "All preparation requirements are complete.",
              impact: "The project is ready for event execution.",
              actionLabel: "Start Event",
              action: () => undefined,
            };

  return (
    <WorkspaceLayout
      bottomAction={
        <SmartCard
          icon={<CheckCircle2 aria-hidden="true" className="size-5" />}
          primaryValue={preparationComplete ? "Project Preparation Complete" : "Preparation in progress"}
          secondaryValue={preparationComplete ? "Next Recommended Experience · Start Event" : "Complete every preparation requirement."}
          status={<StatusBadge label={preparationComplete ? "Ready for Production" : `${preparationScore}% ready`} variant={preparationComplete ? "success" : "info"} />}
          title="Preparation status"
        />
      }
      copilot={
        <div className="space-y-4">
          <OrbitCopilot
            actionLabel={decision.actionLabel}
            estimatedTime="30 seconds"
            onAction={decision.action}
            recommendation={decision.recommendation}
          />
          <SmartCard
            primaryValue={decision.reason}
            secondaryValue={decision.impact}
            title="Decision context"
          />
        </div>
      }
      header={<ProjectHeader {...props} status={ProjectStatus.CONFIRMED} />}
      mainContent={
        <div className="grid gap-4 sm:grid-cols-2">
          <SmartCard
            actionLabel={operatorAssigned ? undefined : "Assign Operator"}
            icon={<UserRound aria-hidden="true" className="size-5" />}
            onAction={() => setOperatorAssigned(true)}
            primaryValue={operatorAssigned ? "Valentina Rojas" : "Not assigned"}
            secondaryValue={operatorAssigned ? "+56 9 5555 0128" : "Operator required"}
            status={<StatusBadge label={operatorAssigned ? "Assigned" : "Pending"} variant={operatorAssigned ? "success" : "warning"} />}
            title="Operator"
          />

          <SmartCard
            actionLabel={equipmentAssigned ? undefined : "Assign Equipment"}
            icon={<Camera aria-hidden="true" className="size-5" />}
            onAction={() => setEquipmentAssigned(true)}
            primaryValue={equipmentAssigned ? "Classic Booth" : "Not assigned"}
            secondaryValue="Assigned booth"
            status={<StatusBadge label={equipmentAssigned ? "Assigned" : "Pending"} variant={equipmentAssigned ? "success" : "warning"} />}
            title="Equipment"
          >
            <dl className="divide-y">
              <DetailRow label="Camera" value={equipmentAssigned ? "Sony A7 IV" : "Pending"} />
              <DetailRow label="Printer" value={equipmentAssigned ? "DNP RX1HS" : "Pending"} />
            </dl>
          </SmartCard>

          <SmartCard
            actionLabel={vehicleAssigned ? undefined : "Assign Vehicle"}
            icon={<CarFront aria-hidden="true" className="size-5" />}
            onAction={() => setVehicleAssigned(true)}
            primaryValue={vehicleAssigned ? "Ford Transit" : "Not assigned"}
            secondaryValue="Production vehicle"
            status={<StatusBadge label={vehicleAssigned ? "Assigned" : "Pending"} variant={vehicleAssigned ? "success" : "warning"} />}
            title="Vehicle"
          >
            <dl className="divide-y">
              <DetailRow label="Route" value={vehicleAssigned ? "CasaPiedra · Costanera Norte" : "Pending"} />
              <DetailRow label="Departure time" value={vehicleAssigned ? "16:30" : "Pending"} />
            </dl>
          </SmartCard>

          <SmartCard
            icon={<PackageCheck aria-hidden="true" className="size-5" />}
            primaryValue={`${completedChecklistItems}/${checklistItems.length}`}
            secondaryValue="Checklist items complete"
            status={<StatusBadge label={checklistComplete ? "Complete" : "In progress"} variant={checklistComplete ? "success" : "info"} />}
            title="Preparation Checklist"
          >
            <fieldset className="space-y-2">
              <legend className="sr-only">Preparation checklist items</legend>
              {checklistItems.map((item) => (
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-accent" key={item}>
                  <input
                    checked={checklist[item]}
                    className="size-4 accent-foreground"
                    onChange={() => toggleChecklistItem(item)}
                    type="checkbox"
                  />
                  <span className={checklist[item] ? "text-muted line-through" : undefined}>{item}</span>
                </label>
              ))}
            </fieldset>
          </SmartCard>

          <SmartCard
            className="sm:col-span-2"
            icon={<ClipboardCheck aria-hidden="true" className="size-5" />}
            primaryValue={`${preparationScore}%`}
            secondaryValue={preparationComplete ? "Ready for Production" : "Preparation requirements pending"}
            status={<StatusBadge label={preparationComplete ? "Ready" : "Preparing"} variant={preparationComplete ? "success" : "info"} />}
            title="Preparation"
          />
        </div>
      }
      timeline={null}
    />
  );
}
