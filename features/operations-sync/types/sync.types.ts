import type { ProjectState } from "@/features/projects/engine";

export type SyncStatus = "PENDING" | "READY" | "COMPLETED";

export type SyncDestination =
  | "GOOGLE_CALENDAR"
  | "GOOGLE_DRIVE"
  | "WHATSAPP"
  | "EMAIL"
  | "FUTURE_INTEGRATION";

export type SyncDestinationStatus = "PENDING" | "COMPLETED" | "SKIPPED";

export interface SyncTeamMember {
  id: string;
  name: string;
  role: string;
}

export interface SyncVehicle {
  id: string;
  label: string;
}

export interface SyncDestinationRequest {
  destination: SyncDestination;
  status: SyncDestinationStatus;
}

export interface SyncRequest {
  id: string;
  projectId: string;
  customerId: string;
  operationId: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  location: string;
  assignedTeam: readonly SyncTeamMember[];
  assignedVehicle: SyncVehicle | null;
  status: SyncStatus;
  destinations: readonly SyncDestinationRequest[];
  createdAt: string;
}

export interface CreateSyncRequestInput {
  projectState: ProjectState;
  projectId: string;
  customerId: string;
  operationId: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  location: string;
  assignedTeam: readonly SyncTeamMember[];
  assignedVehicle?: SyncVehicle | null;
  destinations?: readonly SyncDestination[];
  createdAt: string;
}

export type SyncRequestError =
  | {
      code: "PROJECT_NOT_CONFIRMED";
      currentState: ProjectState;
      message: string;
    }
  | {
      code: "INVALID_OPERATION_WINDOW";
      message: string;
    }
  | {
      code: "MISSING_REQUIRED_FIELD";
      field: "projectId" | "customerId" | "operationId" | "eventDate" | "location" | "createdAt";
      message: string;
    }
  | {
      code: "INVALID_STATUS_TRANSITION";
      currentStatus: SyncStatus;
      targetStatus: SyncStatus;
      message: string;
    };

export type CreateSyncRequestResult =
  | { success: true; request: SyncRequest }
  | { success: false; error: SyncRequestError };

export type UpdateSyncStatusResult =
  | { success: true; request: SyncRequest }
  | { success: false; error: SyncRequestError };
