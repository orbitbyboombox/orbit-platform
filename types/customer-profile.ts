import type { AuditMetadata } from "./audit";
import type { ProductionStateDescriptor } from "./production-state";

export interface CustomerProjectSummary {
  projectId: string;
  name: string;
  eventDate?: string;
  stage: string;
  status: string;
}

export interface CustomerProfileProjection extends AuditMetadata {
  customerId: string;
  fullName: string;
  email?: string;
  phone?: string;
  company?: string;
  projects: readonly CustomerProjectSummary[];
  timelineEventIds: readonly string[];
  communicationEventIds: readonly string[];
  dataState: ProductionStateDescriptor;
}

export interface CustomerProfileProjectionReader {
  findByCustomerId(customerId: string): Promise<CustomerProfileProjection | null>;
}
