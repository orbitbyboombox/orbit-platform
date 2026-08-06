import type { EventProfitSummary } from "../types/profit.types";

export interface ProfitSnapshot extends EventProfitSummary {
  id: string;
  projectId: string;
  expenseCost: number;
  version: number;
  timelineEventIds: readonly string[];
  createdAt: string;
}

export interface ProfitSnapshotDraft {
  projectId: string;
  revenue: number;
  staffCost: number;
  transportCost: number;
  fuelCost: number;
  tollCost: number;
  suppliesCost: number;
  expenseCost: number;
  eventName: string;
  service: string;
  timelineEventIds: readonly string[];
  reason: string;
}

export interface ProfitSnapshotUpdate extends Partial<Omit<ProfitSnapshotDraft, "projectId">> {
  snapshotId: string;
  expectedVersion: number;
  reason: string;
}

export interface ProfitRepository {
  findAll(): Promise<readonly ProfitSnapshot[]>;
  create(input: ProfitSnapshotDraft): Promise<string>;
  update(input: ProfitSnapshotUpdate): Promise<void>;
  softDelete(snapshotId: string, expectedVersion: number, reason: string): Promise<void>;
  restore(snapshotId: string, expectedVersion: number, reason: string): Promise<void>;
}
