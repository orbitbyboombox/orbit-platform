import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ProfitRepository,
  ProfitSnapshot,
  ProfitSnapshotDraft,
  ProfitSnapshotUpdate,
} from "./profit.repository";

interface ProfitRow {
  id: string;
  project_id: string;
  revenue: number | string;
  crew_cost: number | string;
  transport_cost: number | string;
  fuel_cost: number | string;
  supplies_cost: number | string;
  expense_cost: number | string;
  operational_cost: number | string;
  gross_margin: number | string;
  gross_margin_percent: number | string;
  basis: Record<string, unknown>;
  version: number;
  created_at: string;
}

const numeric = (value: number | string): number => Number(value);
const stringValue = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;
const stringList = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export class SupabaseProfitRepository implements ProfitRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findAll(): Promise<readonly ProfitSnapshot[]> {
    const { data, error } = await this.client
      .from("profit_snapshots")
      .select("id,project_id,revenue,crew_cost,transport_cost,fuel_cost,supplies_cost,expense_cost,operational_cost,gross_margin,gross_margin_percent,basis,version,created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as ProfitRow[])
      .filter((row) => row.basis.systemCertification !== true)
      .map((row) => this.toSnapshot(row));
  }

  async create(input: ProfitSnapshotDraft): Promise<string> {
    const actorId = await this.actorId();
    const { data, error } = await this.client
      .from("profit_snapshots")
      .insert(this.toRecord(input, actorId))
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async update(input: ProfitSnapshotUpdate): Promise<void> {
    const current = await this.findById(input.snapshotId);
    const merged: ProfitSnapshotDraft = {
      projectId: current.projectId,
      revenue: input.revenue ?? current.revenue,
      staffCost: input.staffCost ?? current.staffCost,
      transportCost: input.transportCost ?? current.transportCost,
      fuelCost: input.fuelCost ?? current.fuelCost,
      tollCost: input.tollCost ?? current.tollCost,
      suppliesCost: input.suppliesCost ?? current.suppliesCost,
      expenseCost: input.expenseCost ?? current.expenseCost,
      eventName: input.eventName ?? current.eventName,
      service: input.service ?? current.service,
      timelineEventIds: input.timelineEventIds ?? current.timelineEventIds,
      reason: input.reason,
    };
    const actorId = await this.actorId();
    const record = this.toRecord(merged, actorId);
    delete record.project_id;
    delete record.created_by;
    await this.versionedUpdate(input.snapshotId, input.expectedVersion, record);
  }

  async softDelete(snapshotId: string, expectedVersion: number, reason: string): Promise<void> {
    await this.setDeleted(snapshotId, expectedVersion, new Date().toISOString(), reason);
  }

  async restore(snapshotId: string, expectedVersion: number, reason: string): Promise<void> {
    await this.setDeleted(snapshotId, expectedVersion, null, reason);
  }

  private async findById(id: string): Promise<ProfitSnapshot> {
    const { data, error } = await this.client
      .from("profit_snapshots")
      .select("id,project_id,revenue,crew_cost,transport_cost,fuel_cost,supplies_cost,expense_cost,operational_cost,gross_margin,gross_margin_percent,basis,version,created_at")
      .eq("id", id)
      .single();
    if (error) throw error;
    return this.toSnapshot(data as ProfitRow);
  }

  private toRecord(input: ProfitSnapshotDraft, actorId: string): Record<string, unknown> {
    const operationalCost = input.staffCost + input.transportCost + input.fuelCost + input.tollCost + input.suppliesCost + input.expenseCost;
    const grossMargin = input.revenue - operationalCost;
    return {
      project_id: input.projectId,
      revenue: input.revenue,
      crew_cost: input.staffCost,
      transport_cost: input.transportCost,
      fuel_cost: input.fuelCost,
      supplies_cost: input.suppliesCost,
      expense_cost: input.expenseCost,
      operational_cost: operationalCost,
      gross_margin: grossMargin,
      gross_margin_percent: input.revenue === 0 ? 0 : (grossMargin / input.revenue) * 100,
      basis: {
        eventName: input.eventName,
        service: input.service,
        tollCost: input.tollCost,
        timelineEventIds: input.timelineEventIds,
      },
      created_by: actorId,
      updated_by: actorId,
      approval_reason: input.reason,
    };
  }

  private toSnapshot(row: ProfitRow): ProfitSnapshot {
    return {
      id: row.id,
      projectId: row.project_id,
      eventId: row.project_id,
      eventName: stringValue(row.basis.eventName, "Evento ORBIT"),
      service: stringValue(row.basis.service, "Servicio"),
      revenue: numeric(row.revenue),
      staffCost: numeric(row.crew_cost),
      transportCost: numeric(row.transport_cost),
      fuelCost: numeric(row.fuel_cost),
      tollCost: numeric(row.basis.tollCost as number | string ?? 0),
      suppliesCost: numeric(row.supplies_cost),
      expenseCost: numeric(row.expense_cost),
      operationalCost: numeric(row.operational_cost),
      estimatedGrossMargin: numeric(row.gross_margin),
      grossMarginPercentage: numeric(row.gross_margin_percent),
      version: row.version,
      timelineEventIds: stringList(row.basis.timelineEventIds),
      createdAt: row.created_at,
    };
  }

  private async actorId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) throw error ?? new Error("Sesión requerida.");
    return data.user.id;
  }

  private async versionedUpdate(id: string, version: number, patch: Record<string, unknown>): Promise<void> {
    const { data, error } = await this.client
      .from("profit_snapshots")
      .update(patch)
      .eq("id", id)
      .eq("version", version)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("El registro fue modificado por otra sesión. Recarga antes de continuar.");
  }

  private async setDeleted(id: string, version: number, deletedAt: string | null, reason: string): Promise<void> {
    const actorId = await this.actorId();
    await this.versionedUpdate(id, version, {
      deleted_at: deletedAt,
      deleted_by: deletedAt ? actorId : null,
      approval_reason: reason,
      updated_by: actorId,
    });
  }
}
