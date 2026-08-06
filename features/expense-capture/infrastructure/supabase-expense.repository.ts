import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseTimelineRepository } from "@/features/projects/infrastructure";
import type { ExpenseDraft, ExpenseRecord, ExpenseRepository, ExpenseUpdate } from "./expense.repository";

interface ExpenseRow { id: string; project_id: string | null; supply_id: string | null; category: ExpenseRecord["category"]; supplier: string | null; document_number: string | null; occurred_on: string; subtotal: number | string | null; vat: number | string | null; total: number | string; currency: string; vehicle_id: string | null; receipt_path: string | null; status: string; version: number; }
const optionalNumber = (value: number | string | null): number | undefined => value == null ? undefined : Number(value);

export class SupabaseExpenseRepository implements ExpenseRepository {
  private readonly timeline: SupabaseTimelineRepository;
  constructor(private readonly client: SupabaseClient) { this.timeline = new SupabaseTimelineRepository(client); }
  async findAll(): Promise<readonly ExpenseRecord[]> {
    const { data, error } = await this.client.from("expenses").select("id,project_id,supply_id,category,supplier,document_number,occurred_on,subtotal,vat,total,currency,vehicle_id,receipt_path,status,version").is("deleted_at", null).order("occurred_on", { ascending: false });
    if (error) throw error;
    return (data as ExpenseRow[]).map((row) => ({ id: row.id, projectId: row.project_id ?? undefined, supplyId: row.supply_id ?? undefined, category: row.category, supplier: row.supplier ?? undefined, documentNumber: row.document_number ?? undefined, occurredOn: row.occurred_on, subtotal: optionalNumber(row.subtotal), vat: optionalNumber(row.vat), total: Number(row.total), currency: row.currency, vehicleId: row.vehicle_id ?? undefined, receiptPath: row.receipt_path ?? undefined, status: row.status, version: row.version }));
  }
  async create(input: ExpenseDraft): Promise<string> {
    const actorId = await this.actorId();
    const { data, error } = await this.client.from("expenses").insert({ ...this.record(input), status: "PENDING", created_by: actorId, updated_by: actorId, approval_reason: input.reason }).select("id").single();
    if (error) throw error;
    if (input.projectId) await this.appendTimeline(input.projectId, data.id, actorId, "Gasto registrado correctamente.");
    return data.id;
  }
  async update(input: ExpenseUpdate): Promise<void> { const actorId = await this.actorId(); await this.versioned(input.expenseId, input.expectedVersion, { ...this.record(input), updated_by: actorId, approval_reason: input.reason }); }
  async softDelete(id: string, version: number, reason: string): Promise<void> { const actorId = await this.actorId(); await this.versioned(id, version, { deleted_at: new Date().toISOString(), updated_by: actorId, approval_reason: reason }); }
  async restore(id: string, version: number, reason: string): Promise<void> { const actorId = await this.actorId(); await this.versioned(id, version, { deleted_at: null, updated_by: actorId, approval_reason: reason }); }
  private record(input: Partial<ExpenseDraft>) { return { ...(input.projectId !== undefined && { project_id: input.projectId }), ...(input.supplyId !== undefined && { supply_id: input.supplyId }), ...(input.category !== undefined && { category: input.category }), ...(input.supplier !== undefined && { supplier: input.supplier }), ...(input.documentNumber !== undefined && { document_number: input.documentNumber }), ...(input.occurredOn !== undefined && { occurred_on: input.occurredOn }), ...(input.subtotal !== undefined && { subtotal: input.subtotal }), ...(input.vat !== undefined && { vat: input.vat }), ...(input.total !== undefined && { total: input.total }), ...(input.currency !== undefined && { currency: input.currency }), ...(input.vehicleId !== undefined && { vehicle_id: input.vehicleId }), ...(input.receiptPath !== undefined && { receipt_path: input.receiptPath }) }; }
  private async actorId() { const { data, error } = await this.client.auth.getUser(); if (error || !data.user) throw error ?? new Error("Sesión requerida."); return data.user.id; }
  private async versioned(id: string, version: number, patch: Record<string, unknown>) { const { data, error } = await this.client.from("expenses").update(patch).eq("id", id).eq("version", version).select("id").maybeSingle(); if (error) throw error; if (!data) throw new Error("El gasto fue modificado por otra sesión."); }
  private async appendTimeline(projectId: string, expenseId: string, actorId: string, humanMessage: string) { const { data, error } = await this.client.from("projects").select("customer_id,orbit_event_id").eq("id", projectId).single(); if (error) throw error; await this.timeline.append({ projectId, customerId: data.customer_id, orbitEventId: data.orbit_event_id, actorId, actorLabel: "Administrador", source: "Administrator", action: "EXPENSE_REGISTERED", entityType: "Expense", entityId: expenseId, humanMessage, correlationId: crypto.randomUUID(), newState: "PENDING" }); }
}
