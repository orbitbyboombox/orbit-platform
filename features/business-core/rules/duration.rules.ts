import { getService } from "../catalog";
import type { DurationRule, ServiceId } from "../types";

export function getDurationRule(serviceId: ServiceId): DurationRule {
  return getService(serviceId).duration;
}

export function shouldRequestDuration(serviceId: ServiceId): boolean {
  return getDurationRule(serviceId).shouldRequestDuration;
}

export function hasFixedDuration(serviceId: ServiceId): boolean {
  return getDurationRule(serviceId).mode === "FIXED";
}
