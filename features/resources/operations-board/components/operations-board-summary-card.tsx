import { Gauge } from "lucide-react";
import { SmartCard } from "@/components/cards/smart-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CommandCenterOperationalIndicators } from "../types/operations-board.types";

export interface OperationsBoardSummaryCardProps {
  indicators: CommandCenterOperationalIndicators;
}

export function OperationsBoardSummaryCard({ indicators }: OperationsBoardSummaryCardProps) {
  return (
    <SmartCard
      icon={<Gauge aria-hidden="true" className="size-5" />}
      primaryValue={`${indicators.operationalCapacityPercentage}%`}
      secondaryValue={`${indicators.potentialAdditionalEvents} evento adicional posible`}
      status={<StatusBadge label={`${indicators.activeAlerts} alertas activas`} variant="warning" />}
      title="Capacidad operacional"
    >
      <p className="text-sm text-muted">{indicators.upcomingMaintenance} mantenimiento próximo · Indicadores generados por el Tablero de Operaciones.</p>
    </SmartCard>
  );
}
