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
  "Conexión a internet",
  "Prueba de impresora",
  "Prueba de cámara",
  "Papel cargado",
  "Plantilla aprobada",
  "Equipo confirmado",
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
        recommendation: "Asignar operador",
        reason: "Aún no se ha asignado un operador.",
        impact: "El evento no puede avanzar a producción.",
        actionLabel: "Asignar operador",
        action: () => setOperatorAssigned(true),
      }
    : !equipmentAssigned
      ? {
          recommendation: "Asignar equipamiento",
          reason: "El kit de producción no está asignado.",
          impact: "No se puede verificar la preparación del equipo.",
          actionLabel: "Asignar equipamiento",
          action: () => setEquipmentAssigned(true),
        }
      : !vehicleAssigned
        ? {
            recommendation: "Asignar vehículo",
            reason: "El transporte no está asignado.",
            impact: "El equipo no puede salir hacia el lugar.",
            actionLabel: "Asignar vehículo",
            action: () => setVehicleAssigned(true),
          }
        : nextChecklistItem
          ? {
              recommendation: `Complete ${nextChecklistItem}`,
              reason: `${nextChecklistItem} is still pending.`,
              impact: "La preparación no puede marcarse como completa.",
              actionLabel: "Marcar como completo",
              action: () => toggleChecklistItem(nextChecklistItem),
            }
          : {
              recommendation: "Iniciar evento",
              reason: "Todos los requisitos de preparación están completos.",
              impact: "El proyecto está listo para ejecutar el evento.",
              actionLabel: "Iniciar evento",
              action: () => undefined,
            };

  return (
    <WorkspaceLayout
      bottomAction={
        <SmartCard
          icon={<CheckCircle2 aria-hidden="true" className="size-5" />}
          primaryValue={preparationComplete ? "Preparación del proyecto completa" : "Preparación en curso"}
          secondaryValue={preparationComplete ? "Siguiente experiencia recomendada · Iniciar evento" : "Completa cada requisito de preparación."}
          status={<StatusBadge label={preparationComplete ? "Listo para producción" : `${preparationScore}% listo`} variant={preparationComplete ? "success" : "info"} />}
          title="Estado de preparación"
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
            title="Contexto de la decisión"
          />
        </div>
      }
      header={<ProjectHeader {...props} status={ProjectStatus.CONFIRMED} />}
      mainContent={
        <div className="grid gap-4 sm:grid-cols-2">
          <SmartCard
            actionLabel={operatorAssigned ? undefined : "Asignar operador"}
            icon={<UserRound aria-hidden="true" className="size-5" />}
            onAction={() => setOperatorAssigned(true)}
            primaryValue={operatorAssigned ? "Valentina Rojas" : "Sin asignar"}
            secondaryValue={operatorAssigned ? "+56 9 5555 0128" : "Operador requerido"}
            status={<StatusBadge label={operatorAssigned ? "Asignado" : "Pendiente"} variant={operatorAssigned ? "success" : "warning"} />}
            title="Operador"
          />

          <SmartCard
            actionLabel={equipmentAssigned ? undefined : "Asignar equipamiento"}
            icon={<Camera aria-hidden="true" className="size-5" />}
            onAction={() => setEquipmentAssigned(true)}
            primaryValue={equipmentAssigned ? "Cabina Classic" : "Sin asignar"}
            secondaryValue="Cabina asignada"
            status={<StatusBadge label={equipmentAssigned ? "Asignado" : "Pendiente"} variant={equipmentAssigned ? "success" : "warning"} />}
            title="Equipamiento"
          >
            <dl className="divide-y">
              <DetailRow label="Cámara" value={equipmentAssigned ? "Sony A7 IV" : "Pendiente"} />
              <DetailRow label="Impresora" value={equipmentAssigned ? "DNP RX1HS" : "Pendiente"} />
            </dl>
          </SmartCard>

          <SmartCard
            actionLabel={vehicleAssigned ? undefined : "Asignar vehículo"}
            icon={<CarFront aria-hidden="true" className="size-5" />}
            onAction={() => setVehicleAssigned(true)}
            primaryValue={vehicleAssigned ? "Ford Transit" : "Sin asignar"}
            secondaryValue="Vehículo de producción"
            status={<StatusBadge label={vehicleAssigned ? "Asignado" : "Pendiente"} variant={vehicleAssigned ? "success" : "warning"} />}
            title="Vehículo"
          >
            <dl className="divide-y">
              <DetailRow label="Ruta" value={vehicleAssigned ? "CasaPiedra · Costanera Norte" : "Pendiente"} />
              <DetailRow label="Hora de salida" value={vehicleAssigned ? "16:30" : "Pendiente"} />
            </dl>
          </SmartCard>

          <SmartCard
            icon={<PackageCheck aria-hidden="true" className="size-5" />}
            primaryValue={`${completedChecklistItems}/${checklistItems.length}`}
            secondaryValue="Elementos completados"
            status={<StatusBadge label={checklistComplete ? "Completo" : "En curso"} variant={checklistComplete ? "success" : "info"} />}
            title="Checklist de preparación"
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
            secondaryValue={preparationComplete ? "Listo para producción" : "Requisitos de preparación pendientes"}
            status={<StatusBadge label={preparationComplete ? "Listo" : "Preparando"} variant={preparationComplete ? "success" : "info"} />}
            title="Preparación"
          />
        </div>
      }
      timeline={null}
    />
  );
}
