import type { OperationalWindowConfig } from "../types";

export const DEFAULT_OPERATIONAL_RULES: OperationalWindowConfig = Object.freeze({
  mountingMinutes: 45,
  dismantlingMinutes: 30,
  operatorCallLeadMinutes: 60,
  lateEventThreshold: "21:00",
  operationalLimitTime: "06:00",
  warehouseName: "Chicureo",
});

export const VEHICLE_MAINTENANCE_UPCOMING_THRESHOLD_KM = 1_000;
