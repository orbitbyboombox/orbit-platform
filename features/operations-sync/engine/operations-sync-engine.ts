import { ProjectState } from "@/features/projects/engine";
import type {
  CreateSyncRequestInput,
  CreateSyncRequestResult,
  SyncDestination,
  SyncDestinationRequest,
  SyncRequest,
  SyncStatus,
  UpdateSyncStatusResult,
} from "../types";

export const DEFAULT_SYNC_DESTINATIONS: readonly SyncDestination[] = [
  "GOOGLE_CALENDAR",
  "GOOGLE_DRIVE",
  "WHATSAPP",
  "EMAIL",
];

const SYNC_STATUS_TRANSITIONS: Readonly<Record<SyncStatus, SyncStatus | null>> = {
  PENDING: "READY",
  READY: "COMPLETED",
  COMPLETED: null,
};

const requiredFields = [
  "projectId",
  "customerId",
  "operationId",
  "eventDate",
  "location",
  "createdAt",
] as const;

export function createSyncRequest(input: CreateSyncRequestInput): CreateSyncRequestResult {
  if (input.projectState !== ProjectState.CONFIRMED) {
    return {
      success: false,
      error: {
        code: "PROJECT_NOT_CONFIRMED",
        currentState: input.projectState,
        message: "Solo un proyecto confirmado puede crear una solicitud de sincronización.",
      },
    };
  }

  for (const field of requiredFields) {
    if (!input[field].trim()) {
      return {
        success: false,
        error: {
          code: "MISSING_REQUIRED_FIELD",
          field,
          message: `El campo ${field} es obligatorio para sincronizar operaciones.`,
        },
      };
    }
  }

  if (!isValidTime(input.startTime) || !isValidTime(input.endTime) || input.endTime <= input.startTime) {
    return {
      success: false,
      error: {
        code: "INVALID_OPERATION_WINDOW",
        message: "La hora de término debe ser posterior a la hora de inicio.",
      },
    };
  }

  const destinations = uniqueDestinations(input.destinations ?? DEFAULT_SYNC_DESTINATIONS);

  return {
    success: true,
    request: Object.freeze({
      id: createSyncRequestId(input.projectId, input.operationId),
      projectId: input.projectId,
      customerId: input.customerId,
      operationId: input.operationId,
      eventDate: input.eventDate,
      startTime: input.startTime,
      endTime: input.endTime,
      location: input.location,
      assignedTeam: Object.freeze([...input.assignedTeam]),
      assignedVehicle: input.assignedVehicle ?? null,
      status: "READY",
      destinations: Object.freeze(destinations.map(createDestinationRequest)),
      createdAt: input.createdAt,
    }),
  };
}

export function updateSyncRequestStatus(
  request: SyncRequest,
  targetStatus: SyncStatus,
): UpdateSyncStatusResult {
  if (request.status === targetStatus) return { success: true, request };

  if (SYNC_STATUS_TRANSITIONS[request.status] !== targetStatus) {
    return {
      success: false,
      error: {
        code: "INVALID_STATUS_TRANSITION",
        currentStatus: request.status,
        targetStatus,
        message: `No se puede cambiar la sincronización de ${request.status} a ${targetStatus}.`,
      },
    };
  }

  return {
    success: true,
    request: Object.freeze({ ...request, status: targetStatus }),
  };
}

export function createSyncRequestId(projectId: string, operationId: string): string {
  return `SYNC:${projectId}:${operationId}`;
}

function createDestinationRequest(destination: SyncDestination): SyncDestinationRequest {
  return Object.freeze({ destination, status: "PENDING" });
}

function uniqueDestinations(destinations: readonly SyncDestination[]): readonly SyncDestination[] {
  return [...new Set(destinations)];
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
