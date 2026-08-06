import type {
  CommercialValue,
  DurationHours,
  EventTypeId,
  Money,
  PricingLine,
  ServiceId,
} from "@/features/business-core";
import type { ProjectState } from "@/features/projects/engine";
import type { SyncTeamMember, SyncVehicle } from "../types";

export interface OperationPayloadProject {
  readonly id: string;
  readonly name: string;
  readonly currentState: ProjectState;
}

export interface OperationPayloadCustomer {
  readonly fullName: string;
  readonly phone: string;
  readonly email: string;
}

export interface OperationPayloadCommercial {
  readonly eventType: EventTypeId;
  readonly service: ServiceId;
  readonly durationHours: DurationHours | null;
  readonly extras: readonly PricingLine[];
  readonly transport: CommercialValue<Money>;
}

export interface OperationPayloadPortal {
  readonly id: string;
  readonly url: string;
}

export type OperationApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "PROOF_REQUESTED"
  | "PAUSED";

export interface OperationPayloadOperation {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly location: string;
  readonly assignedTeam: readonly SyncTeamMember[];
  readonly assignedVehicle: SyncVehicle | null;
  readonly approvalStatus: OperationApprovalStatus;
}

export interface OperationPayloadMetadata {
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly operationId: string;
}

export interface OperationPayload {
  readonly project: OperationPayloadProject;
  readonly customer: OperationPayloadCustomer;
  readonly commercial: OperationPayloadCommercial;
  readonly portal: OperationPayloadPortal;
  readonly operation: OperationPayloadOperation;
  readonly metadata: OperationPayloadMetadata;
}
