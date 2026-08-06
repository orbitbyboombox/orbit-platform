import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseTimelineRepository } from "@/features/projects/infrastructure";
import type { StaffCapability, StaffClassification, StaffMember, StaffResponseStatus, StaffSpecialization, StaffStatus, StaffType } from "../types/staff-management.types";
import type { StaffAssignmentDraft, StaffDraft, StaffRepository, StaffUpdate } from "./staff.repository";

interface StaffRow { id: string; first_name: string; last_name: string; rut: string | null; phone: string | null; email: string | null; address: string | null; commune: string | null; emergency_contact: Record<string, unknown> | null; start_date: string | null; role: string; rates: Record<string, unknown>; driving_license: string | null; can_drive: boolean; availability: Record<string, unknown>; observations: string | null; status: string; operational_group: string | null; capabilities: string[]; specializations: string[]; version: number; }
interface AssignmentRow { id: string; staff_id: string; project_id: string; status: string; resources: Record<string, unknown>; created_at: string; }
interface ProjectRow { id: string; name: string; project_type: string; orbit_event_id: string; }

const text = (value: unknown, fallback = ""): string => typeof value === "string" ? value : fallback;
const number = (value: unknown): number => typeof value === "number" ? value : 0;
const staffType = (value: string): StaffType => ["OPERATOR", "INSTALLATION", "REMOVAL", "ADMINISTRATOR", "FUTURE"].includes(value) ? value as StaffType : "FUTURE";
const staffStatus = (value: string): StaffStatus => ["ACTIVE", "VACATION", "MEDICAL_LEAVE", "INACTIVE"].includes(value) ? value as StaffStatus : "INACTIVE";
const responseStatus = (value: string): StaffResponseStatus => ["PENDING", "ACCEPTED", "REJECTED", "ASSISTANCE_REQUESTED"].includes(value) ? value as StaffResponseStatus : "PENDING";

export class SupabaseStaffRepository implements StaffRepository {
  private readonly timeline: SupabaseTimelineRepository;
  constructor(private readonly client: SupabaseClient) { this.timeline = new SupabaseTimelineRepository(client); }

  async findAll(): Promise<readonly StaffMember[]> {
    const [{ data: staff, error: staffError }, { data: assignments, error: assignmentError }, { data: projects, error: projectError }] = await Promise.all([
      this.client.from("staff").select("id,first_name,last_name,rut,phone,email,address,commune,emergency_contact,start_date,role,rates,driving_license,can_drive,availability,observations,status,operational_group,capabilities,specializations,version").is("deleted_at", null).order("last_name"),
      this.client.from("assignments").select("id,staff_id,project_id,status,resources,created_at").is("deleted_at", null).order("created_at", { ascending: false }),
      this.client.from("projects").select("id,name,project_type,orbit_event_id"),
    ]);
    const error = staffError ?? assignmentError ?? projectError;
    if (error) throw error;
    const projectMap = new Map((projects as ProjectRow[]).map((row) => [row.id, row]));
    return (staff as StaffRow[]).map((row) => this.toMember(row, (assignments as AssignmentRow[]).filter((item) => item.staff_id === row.id), projectMap));
  }

  async create(input: StaffDraft): Promise<string> {
    const actorId = await this.actorId();
    const { data, error } = await this.client.from("staff").insert(this.staffInsert(input, actorId)).select("id").single();
    if (error) throw error;
    return data.id;
  }

  async update(input: StaffUpdate): Promise<void> {
    const actorId = await this.actorId();
    const patch: Record<string, unknown> = { approval_reason: input.reason, updated_by: actorId };
    if (input.firstName !== undefined) patch.first_name = input.firstName;
    if (input.lastName !== undefined) patch.last_name = input.lastName;
    if (input.rut !== undefined) patch.rut = input.rut;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.email !== undefined) patch.email = input.email;
    if (input.address !== undefined) patch.address = input.address;
    if (input.commune !== undefined) patch.commune = input.commune;
    if (input.emergencyContact !== undefined) patch.emergency_contact = input.emergencyContact;
    if (input.startDate !== undefined) patch.start_date = input.startDate;
    if (input.staffType !== undefined) patch.role = input.staffType;
    if (input.drivingLicense !== undefined) patch.driving_license = input.drivingLicense;
    if (input.canDriveCompanyVehicle !== undefined) patch.can_drive = input.canDriveCompanyVehicle;
    if (input.observations !== undefined) patch.observations = input.observations;
    if (input.status !== undefined) patch.status = input.status;
    if (input.classification !== undefined) patch.operational_group = input.classification;
    if (input.capabilities !== undefined) patch.capabilities = input.capabilities;
    if (input.specializations !== undefined) patch.specializations = input.specializations;
    if (input.availability !== undefined) patch.availability = { label: input.availability };
    if (input.dailyEventRate !== undefined || input.installationRate !== undefined || input.removalRate !== undefined) patch.rates = { dailyEventRate: input.dailyEventRate ?? 0, installationRate: input.installationRate ?? 0, removalRate: input.removalRate ?? 0 };
    await this.versionedUpdate("staff", input.staffId, input.expectedVersion, patch);
  }

  async assign(input: StaffAssignmentDraft): Promise<string> {
    const actorId = await this.actorId();
    const { data: project, error: projectError } = await this.client.from("projects").select("orbit_event_id").eq("id", input.projectId).single();
    if (projectError) throw projectError;
    const { data, error } = await this.client.from("assignments").insert({ project_id: input.projectId, staff_id: input.staffId, assignment_type: input.assignmentType, status: "PENDING", resources: input.resources, reason: input.reason, created_by: actorId, updated_by: actorId }).select("id").single();
    if (error) throw error;
    await this.timeline.append({ orbitEventId: project.orbit_event_id, actorId, actorLabel: "Administrador", source: "Administrator", action: "STAFF_ASSIGNED", entityType: "Assignment", entityId: data.id, projectId: input.projectId, staffId: input.staffId, humanMessage: "Colaborador asignado al evento.", correlationId: crypto.randomUUID(), newState: "PENDING" });
    return data.id;
  }

  async removeAssignment(assignmentId: string, reason: string): Promise<void> {
    const assignment = await this.assignmentContext(assignmentId); const actorId = await this.actorId();
    const { error } = await this.client.from("assignments").update({ deleted_at: new Date().toISOString(), reason, updated_by: actorId }).eq("id", assignmentId).is("deleted_at", null);
    if (error) throw error;
    await this.timeline.append({ orbitEventId: assignment.projects.orbit_event_id, actorId, actorLabel: "Administrador", source: "Administrator", action: "STAFF_REMOVED", entityType: "Assignment", entityId: assignmentId, projectId: assignment.project_id, staffId: assignment.staff_id, previousState: assignment.status, newState: "REMOVED", humanMessage: "Colaborador retirado de la asignación.", correlationId: crypto.randomUUID() });
  }

  async respondToAssignment(assignmentId: string, response: "ACCEPTED" | "REJECTED" | "ASSISTANCE_REQUESTED", reason?: string): Promise<void> {
    const actorId = await this.actorId();
    const assignment = await this.assignmentContext(assignmentId);
    const now = new Date().toISOString();
    const patch = { status: response, reason, response_at: now, accepted_at: response === "ACCEPTED" ? now : null, rejected_at: response === "REJECTED" ? now : null, updated_by: actorId };
    const { error } = await this.client.from("assignments").update(patch).eq("id", assignmentId);
    if (error) throw error;
    const action = response === "ACCEPTED" ? "STAFF_ACCEPTED" : response === "REJECTED" ? "STAFF_REJECTED" : "STAFF_ASSISTANCE_REQUESTED";
    const humanMessage = response === "ACCEPTED" ? "El colaborador aceptó el evento." : response === "REJECTED" ? "El colaborador rechazó el evento." : "El colaborador solicitó asistencia.";
    await this.timeline.append({ orbitEventId: assignment.projects.orbit_event_id, actorId, actorLabel: "Staff", source: "Staff", action, entityType: "Assignment", entityId: assignmentId, projectId: assignment.project_id, staffId: assignment.staff_id, previousState: assignment.status, newState: response, humanMessage, correlationId: crypto.randomUUID() });
  }

  async updateAvailability(staffId: string, expectedVersion: number, availability: string, status: StaffStatus, reason: string): Promise<void> {
    await this.versionedUpdate("staff", staffId, expectedVersion, { availability: { label: availability }, status, approval_reason: reason, updated_by: await this.actorId() });
  }
  async softDelete(staffId: string, expectedVersion: number, reason: string): Promise<void> { await this.setDeleted(staffId, expectedVersion, new Date().toISOString(), reason); }
  async restore(staffId: string, expectedVersion: number, reason: string): Promise<void> { await this.setDeleted(staffId, expectedVersion, null, reason); }

  async recordOperationalEvent(assignmentId: string, action: "ARRIVAL_RECORDED" | "MOUNTING_STARTED" | "MOUNTING_COMPLETED" | "EVENT_STARTED" | "EVENT_FINISHED" | "DISMANTLING_STARTED" | "DISMANTLING_COMPLETED" | "RETURNED_TO_WAREHOUSE", humanMessage: string): Promise<void> {
    const actorId = await this.actorId();
    const assignment = await this.assignmentContext(assignmentId);
    await this.timeline.append({ orbitEventId: assignment.projects.orbit_event_id, actorId, actorLabel: "Staff", source: "Staff", action, entityType: "Assignment", entityId: assignmentId, projectId: assignment.project_id, staffId: assignment.staff_id, humanMessage, correlationId: crypto.randomUUID() });
  }

  private toMember(row: StaffRow, assignments: AssignmentRow[], projects: Map<string, ProjectRow>): StaffMember {
    const accepted = assignments.filter(({ status }) => status === "ACCEPTED").length;
    const rejected = assignments.filter(({ status }) => status === "REJECTED").length;
    const active = assignments.filter(({ status }) => ["PENDING", "ACCEPTED", "ASSISTANCE_REQUESTED"].includes(status));
    const today = active.find(({ resources }) => resources.today === true) ?? active[0];
    const project = today ? projects.get(today.project_id) : undefined;
    const rates = row.rates ?? {};
    const operatorCost = number(rates.dailyEventRate), installationCost = number(rates.installationRate), removalCost = number(rates.removalRate);
    return {
      profile: { id: row.id, version: row.version, firstName: row.first_name, lastName: row.last_name, rut: row.rut ?? "No registrado", phone: row.phone ?? "No registrado", email: row.email ?? "No registrado", address: row.address ?? "No registrada", commune: row.commune ?? "No registrada", emergencyContact: { name: text(row.emergency_contact?.name, "No registrado"), phone: text(row.emergency_contact?.phone, "No registrado") }, startDate: row.start_date ? new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${row.start_date}T12:00:00Z`)) : "No registrada", status: staffStatus(row.status) },
      employment: { staffType: staffType(row.role), classification: (["CALYPSO", "GREEN"].includes(row.operational_group ?? "") ? row.operational_group : undefined) as StaffClassification | undefined, capabilities: row.capabilities as StaffCapability[], specializations: row.specializations as StaffSpecialization[], dailyEventRate: operatorCost, installationRate: installationCost, removalRate: removalCost, drivingLicense: row.driving_license ?? undefined, canDriveCompanyVehicle: row.can_drive, availability: text(row.availability?.label, "Sin disponibilidad informada"), observations: row.observations ?? undefined },
      history: { completedEvents: assignments.filter(({ status }) => status === "COMPLETED").length, acceptedEvents: accepted, rejectedEvents: rejected, lateArrivals: assignments.filter(({ resources }) => resources.lateArrival === true).length, currentAssignments: active.length, upcomingAssignments: active.length },
      today: today ? { id: today.id, eventName: text(today.resources.eventName, project ? `${project.project_type} · ${project.name}` : "Evento asignado"), callTime: text(today.resources.callTime, "Por confirmar"), vehicle: text(today.resources.vehicle, "Por asignar"), blackBox: text(today.resources.blackBox, "Por asignar"), booth: text(today.resources.booth, "Por asignar"), departureTime: text(today.resources.departureTime, "Por confirmar"), responseStatus: responseStatus(today.status) } : undefined,
      financial: { operatorCost, installationCost, removalCost, totalStaffCost: operatorCost + installationCost + removalCost },
    };
  }

  private staffInsert(input: StaffDraft, actorId: string) { return { first_name: input.firstName, last_name: input.lastName, rut: input.rut, phone: input.phone, email: input.email, address: input.address, commune: input.commune, emergency_contact: input.emergencyContact, start_date: input.startDate, role: input.staffType, rates: { dailyEventRate: input.dailyEventRate, installationRate: input.installationRate, removalRate: input.removalRate }, driving_license: input.drivingLicense, can_drive: input.canDriveCompanyVehicle, availability: { label: input.availability }, observations: input.observations, status: input.status ?? "ACTIVE", operational_group: input.classification, capabilities: input.capabilities, specializations: input.specializations ?? [], created_by: actorId, updated_by: actorId }; }
  private async actorId(): Promise<string> { const { data, error } = await this.client.auth.getUser(); if (error || !data.user) throw error ?? new Error("Sesión requerida."); return data.user.id; }
  private async assignmentContext(id: string) { const { data, error } = await this.client.from("assignments").select("id,project_id,staff_id,status,projects!inner(orbit_event_id)").eq("id", id).single(); if (error) throw error; return data as unknown as { id: string; project_id: string; staff_id: string; status: string; projects: { orbit_event_id: string } }; }
  private async versionedUpdate(table: "staff", id: string, version: number, patch: Record<string, unknown>): Promise<void> { const { data, error } = await this.client.from(table).update(patch).eq("id", id).eq("version", version).select("id").maybeSingle(); if (error) throw error; if (!data) throw new Error("El registro fue modificado por otra sesión. Recarga antes de continuar."); }
  private async setDeleted(id: string, version: number, deletedAt: string | null, reason: string): Promise<void> { const actorId = await this.actorId(); await this.versionedUpdate("staff", id, version, { deleted_at: deletedAt, deleted_by: deletedAt ? actorId : null, approval_reason: reason, updated_by: actorId }); }
}
