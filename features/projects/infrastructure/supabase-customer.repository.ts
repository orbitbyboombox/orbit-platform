import type { SupabaseClient } from "@supabase/supabase-js";
import { generateOrbitEventId } from "@/features/connectors/google-calendar";
import type { CustomerMutationInput, CustomerRepository } from "./customer.repository";
import { SupabaseTimelineRepository } from "./supabase-timeline.repository";
import type { Project, ProjectCommercialStage, ProjectDraft, ProjectHealth, ProjectOrigin, ProjectService, ProjectStatus, ProjectType } from "../types/project";

interface CustomerRow { id: string; full_name: string; email: string | null; phone: string | null; company: string | null; city: string | null; metadata: Record<string, unknown>; version: number; }
interface ProjectRow { id: string; customer_id: string; name: string; project_type: string; status: string; health: string; event_date: string | null; event_time: string | null; location: string | null; city: string | null; operations: Record<string, unknown>; }
interface ServiceRow { project_id: string; service_code: string; }
interface TimelineRow { customer_id: string | null; project_id: string | null; human_message: string; occurred_at: string; }
interface MemoryRow { customer_id: string; context: Record<string, unknown>; }

const asString = (value: unknown, fallback = ""): string => typeof value === "string" ? value : fallback;
const projectType = (value: string): ProjectType => ["Wedding", "Corporate", "Birthday", "Graduation", "Private", "Other"].includes(value) ? value as ProjectType : "Other";
const projectStatus = (value: string): ProjectStatus => ["Active", "Upcoming", "Completed", "Archived"].includes(value) ? value as ProjectStatus : "Upcoming";
const projectHealth = (value: string): ProjectHealth => ["Healthy", "Attention", "Risk", "Critical"].includes(value) ? value as ProjectHealth : "Healthy";
const commercialStage = (value: unknown): ProjectCommercialStage => ["New", "Contacted", "Quoting", "Waiting", "Reserved", "Confirmed", "Production", "Finished"].includes(asString(value)) ? value as ProjectCommercialStage : "New";
const origin = (value: unknown): ProjectOrigin | undefined => ["WhatsApp", "Instagram", "Google", "Website", "Referral", "FormerClient", "Other"].includes(asString(value)) ? value as ProjectOrigin : undefined;

export class SupabaseCustomerRepository implements CustomerRepository {
  private readonly timeline: SupabaseTimelineRepository;

  constructor(private readonly client: SupabaseClient) { this.timeline = new SupabaseTimelineRepository(client); }

  async findAll(): Promise<Project[]> {
    const [{ data: customers, error: customerError }, { data: projects, error: projectError }, { data: services, error: servicesError }, { data: timeline, error: timelineError }, { data: memories, error: memoryError }] = await Promise.all([
      this.client.from("customers").select("id,full_name,email,phone,company,city,metadata,version").is("deleted_at", null).order("updated_at", { ascending: false }),
      this.client.from("projects").select("id,customer_id,name,project_type,status,health,event_date,event_time,location,city,operations").is("deleted_at", null).order("event_date", { ascending: true }),
      this.client.from("project_services").select("project_id,service_code"),
      this.client.from("timeline_events").select("customer_id,project_id,human_message,occurred_at").order("occurred_at", { ascending: false }),
      this.client.from("customer_memory").select("customer_id,context").is("deleted_at", null),
    ]);
    const error = customerError ?? projectError ?? servicesError ?? timelineError ?? memoryError;
    if (error) throw error;
    const customerMap = new Map((customers as CustomerRow[]).map((row) => [row.id, row]));
    const serviceMap = new Map<string, ProjectService[]>();
    for (const row of services as ServiceRow[]) {
      const values = serviceMap.get(row.project_id) ?? [];
      if (row.service_code) values.push(row.service_code);
      serviceMap.set(row.project_id, values);
    }
    const memoryMap = new Map((memories as MemoryRow[]).map((row) => [row.customer_id, row.context]));
    return (projects as ProjectRow[]).flatMap((row) => {
      const customer = customerMap.get(row.customer_id);
      if (!customer) return [];
      const recent = (timeline as TimelineRow[]).find((entry) => entry.customer_id === customer.id || entry.project_id === row.id);
      const memory = memoryMap.get(customer.id) ?? {};
      return [{
        id: row.id,
        name: row.name,
        type: projectType(row.project_type),
        client: { name: customer.full_name, email: customer.email ?? "", phone: customer.phone ?? "", company: customer.company ?? undefined },
        event: { date: row.event_date ?? "", time: row.event_time?.slice(0, 5) ?? "00:00", location: row.location ?? "Por confirmar", city: row.city ?? customer.city ?? "" },
        services: serviceMap.get(row.id) ?? [],
        status: projectStatus(row.status), health: projectHealth(row.health),
        stage: asString(row.operations.stage, "Primer contacto"), score: typeof row.operations.score === "number" ? row.operations.score : 60,
        commercialStage: commercialStage(row.operations.commercialStage), origin: origin(row.operations.origin), notes: asString(row.operations.notes) || undefined,
        customerVersion: customer.version,
        lastCommunication: recent ? `${recent.human_message} · ${new Date(recent.occurred_at).toLocaleDateString("es-CL")}` : "Sin comunicaciones recientes",
        salesOwner: asString(memory.salesOwner, "Sin asignar"), nextAction: asString(memory.nextRecommendedAction, "Revisar relación"),
        tags: Array.isArray(memory.tags) ? memory.tags.filter((tag): tag is string => typeof tag === "string") : [],
      } satisfies Project];
    });
  }

  async createWithProject(draft: ProjectDraft): Promise<Project> {
    if (!draft.type || !draft.origin) throw new Error("Datos incompletos para crear el cliente.");
    const { data: authData, error: authError } = await this.client.auth.getUser();
    if (authError || !authData.user) throw authError ?? new Error("Sesión requerida para crear clientes.");
    const actorId = authData.user.id;
    const normalizeRut = (value: string | null | undefined) => (value ?? "").replace(/[^0-9K]/gi, "").toUpperCase();
    const { data: matchingCustomers, error: customerLookupError } = await this.client.from("customers").select("id,rut").is("deleted_at", null);
    if (customerLookupError) throw customerLookupError;
    const existingCustomer = (matchingCustomers ?? []).find((customer) => normalizeRut(customer.rut) === normalizeRut(draft.client.rut));
    const customerId = existingCustomer?.id ?? crypto.randomUUID();
    if (existingCustomer) {
      const { error: customerUpdateError } = await this.client.from("customers").update({ full_name: draft.client.name, email: draft.client.email, phone: draft.client.phone, company: draft.client.company ?? null, city: draft.event.city, metadata: { address: draft.client.address ?? "" }, updated_by: actorId }).eq("id", customerId);
      if (customerUpdateError) throw customerUpdateError;
    } else {
      const { error: customerError } = await this.client.from("customers").insert({ id: customerId, full_name: draft.client.name, email: draft.client.email, phone: draft.client.phone, company: draft.client.company ?? null, rut: draft.client.rut ?? null, city: draft.event.city, metadata: { address: draft.client.address ?? "" }, created_by: actorId, updated_by: actorId });
      if (customerError) throw customerError;
    }
    const { data: existingProject, error: projectLookupError } = await this.client.from("projects").select("id,orbit_event_id").eq("customer_id", customerId).eq("event_date", draft.event.date).eq("event_time", draft.event.time).eq("location", draft.event.location).is("deleted_at", null).maybeSingle();
    if (projectLookupError) throw projectLookupError;
    const projectId = existingProject?.id ?? crypto.randomUUID();
    const orbitEventId = existingProject?.orbit_event_id ?? generateOrbitEventId(draft.event.date, (Number.parseInt(projectId.replaceAll("-", "").slice(-8), 16) % 999999) + 1);
    const operations = { stage: "Primer contacto", commercialStage: "New", origin: draft.origin, notes: draft.notes, score: 60, durationHours: draft.event.durationHours, extras: draft.event.extras ?? [], reservationMethod: "MANUAL" };
    if (existingProject) {
      const { error: projectUpdateError } = await this.client.from("projects").update({ name: draft.client.company || draft.client.name, project_type: draft.type, event_date: draft.event.date, event_time: draft.event.time, location: draft.event.location, city: draft.event.city, operations, updated_by: actorId }).eq("id", projectId);
      if (projectUpdateError) throw projectUpdateError;
    } else {
      const { error: projectError } = await this.client.from("projects").insert({ id: projectId, customer_id: customerId, orbit_event_id: orbitEventId, name: draft.client.company || draft.client.name, project_type: draft.type, status: "Upcoming", health: "Healthy", event_date: draft.event.date, event_time: draft.event.time, location: draft.event.location, city: draft.event.city, operations, created_by: actorId, updated_by: actorId });
      if (projectError) { if (!existingCustomer) await this.client.from("customers").delete().eq("id", customerId); throw projectError; }
    }
    if (draft.services.length) {
      const { error: serviceError } = await this.client.from("project_services").upsert(draft.services.map((service) => ({ project_id: projectId, service_code: service, duration_hours: draft.event.durationHours ?? 2, extras: draft.event.extras ?? [] })), { onConflict: "project_id,service_code" });
      if (serviceError) throw serviceError;
    }
    if (!existingProject) await this.timeline.append({ orbitEventId, actorId, actorLabel: "Administrador", source: "Administrator", action: "CUSTOMER_CREATED", entityType: "Customer", entityId: customerId, customerId, projectId, humanMessage: existingCustomer ? "Nueva reserva creada para cliente existente." : "Cliente creado correctamente.", correlationId: crypto.randomUUID(), newState: "ACTIVE" });
    if (!existingCustomer) {
      const { error: memoryError } = await this.client.from("customer_memory").insert({ customer_id: customerId, context: { customerName: draft.client.name, eventType: draft.type, eventDate: draft.event.date, eventLocation: draft.event.city, currentTimelineStage: "Nuevo", nextRecommendedAction: "Realizar primer contacto" }, created_by: actorId, updated_by: actorId });
      if (memoryError) throw memoryError;
    }
    return { id: projectId, name: draft.client.company || draft.client.name, type: draft.type, client: draft.client, event: draft.event, services: draft.services, status: "Upcoming", health: "Healthy", stage: "Primer contacto", score: 60, commercialStage: "New", origin: draft.origin, notes: draft.notes, customerVersion: 1, lastCommunication: "Relación creada · hoy", salesOwner: "Sin asignar", nextAction: "Realizar primer contacto", tags: [] };
  }

  async update(input: CustomerMutationInput): Promise<void> {
    const actorId = await this.actorId();
    const patch = { ...(input.fullName !== undefined && { full_name: input.fullName }), ...(input.email !== undefined && { email: input.email }), ...(input.phone !== undefined && { phone: input.phone }), ...(input.company !== undefined && { company: input.company }), ...(input.city !== undefined && { city: input.city }), approval_reason: input.reason, updated_by: actorId };
    const { data, error } = await this.client.from("customers").update(patch).eq("id", input.customerId).eq("version", input.expectedVersion).is("deleted_at", null).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("El cliente fue modificado por otra sesión. Recarga antes de continuar.");
    const context = await this.projectContext(input.customerId);
    await this.timeline.append({ ...context, actorId, actorLabel: "Administrador", source: "Administrator", action: "CUSTOMER_UPDATED", entityType: "Customer", entityId: input.customerId, customerId: input.customerId, humanMessage: "Cliente actualizado correctamente.", correlationId: crypto.randomUUID(), previousState: `VERSION_${input.expectedVersion}`, newState: `VERSION_${input.expectedVersion + 1}` });
  }
  async softDelete(customerId: string, expectedVersion: number, reason: string): Promise<void> { await this.setDeletedAt(customerId, expectedVersion, new Date().toISOString(), reason, await this.actorId()); }
  async restore(customerId: string, expectedVersion: number, reason: string): Promise<void> { await this.setDeletedAt(customerId, expectedVersion, null, reason, await this.actorId()); }
  private async setDeletedAt(customerId: string, expectedVersion: number, deletedAt: string | null, reason: string, actorId: string): Promise<void> {
    const { data, error } = await this.client.from("customers").update({ deleted_at: deletedAt, deleted_by: deletedAt ? actorId : null, approval_reason: reason, updated_by: actorId }).eq("id", customerId).eq("version", expectedVersion).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Conflicto de versión al modificar el cliente.");
    const context = await this.projectContext(customerId);
    await this.timeline.append({ ...context, actorId, actorLabel: "Administrador", source: "Administrator", action: "CUSTOMER_UPDATED", entityType: "Customer", entityId: customerId, customerId, humanMessage: deletedAt ? "Cliente archivado correctamente." : "Cliente restaurado correctamente.", correlationId: crypto.randomUUID(), previousState: deletedAt ? "ACTIVE" : "ARCHIVED", newState: deletedAt ? "ARCHIVED" : "ACTIVE" });
  }
  private async projectContext(customerId: string): Promise<{ projectId?: string; orbitEventId: string }> {
    const { data, error } = await this.client.from("projects").select("id,orbit_event_id").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return { projectId: data?.id, orbitEventId: data?.orbit_event_id ?? `ORB-CUSTOMER-${customerId}` };
  }
  private async actorId(): Promise<string> { const { data, error } = await this.client.auth.getUser(); if (error || !data.user) throw error ?? new Error("Sesión requerida."); return data.user.id; }
}
