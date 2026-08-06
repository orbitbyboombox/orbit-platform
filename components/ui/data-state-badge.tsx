import { StatusBadge, type StatusBadgeProps } from "./status-badge";
import { PRODUCTION_STATE_LABELS, type ProductionDataState } from "@/types";

export interface DataStateBadgeProps {
  state: ProductionDataState;
  label?: string;
}

const STATE_VARIANT: Readonly<Record<ProductionDataState, StatusBadgeProps["variant"]>> = {
  REAL: "success",
  ESTIMATED: "info",
  PREPARED: "neutral",
  PENDING: "warning",
  MOCK: "warning",
  DEMO: "warning",
};

export function DataStateBadge({ label, state }: DataStateBadgeProps) {
  return <StatusBadge label={label ?? PRODUCTION_STATE_LABELS[state]} variant={STATE_VARIANT[state]} />;
}
