import type { StaffMember } from "../types/staff-management.types";

export interface StaffDraft {
  firstName: string; lastName: string; rut: string; phone: string; email: string;
  address: string; commune: string; emergencyContact: { name: string; phone: string };
  startDate: string; staffType: StaffMember["employment"]["staffType"];
  dailyEventRate: number; installationRate: number; removalRate: number;
  drivingLicense?: string; canDriveCompanyVehicle: boolean; availability: string;
  observations?: string;
}

export interface StaffUpdate extends Partial<StaffDraft> { staffId: string; expectedVersion: number; reason: string; }
export interface StaffAssignmentDraft { staffId: string; projectId: string; assignmentType: string; resources: Record<string, unknown>; reason: string; }

export interface StaffRepository {
  findAll(): Promise<readonly StaffMember[]>;
  create(input: StaffDraft): Promise<string>;
  update(input: StaffUpdate): Promise<void>;
  assign(input: StaffAssignmentDraft): Promise<string>;
  removeAssignment(assignmentId: string, reason: string): Promise<void>;
  respondToAssignment(assignmentId: string, response: "ACCEPTED" | "REJECTED" | "ASSISTANCE_REQUESTED", reason?: string): Promise<void>;
  updateAvailability(staffId: string, expectedVersion: number, availability: string, status: StaffMember["profile"]["status"], reason: string): Promise<void>;
  softDelete(staffId: string, expectedVersion: number, reason: string): Promise<void>;
  restore(staffId: string, expectedVersion: number, reason: string): Promise<void>;
  recordOperationalEvent(assignmentId: string, action: "ARRIVAL_RECORDED" | "MOUNTING_STARTED" | "MOUNTING_COMPLETED" | "EVENT_STARTED" | "EVENT_FINISHED" | "DISMANTLING_STARTED" | "DISMANTLING_COMPLETED" | "RETURNED_TO_WAREHOUSE", humanMessage: string): Promise<void>;
}
