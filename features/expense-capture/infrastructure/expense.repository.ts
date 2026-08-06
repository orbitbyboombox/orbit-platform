import type { ExpenseCategory } from "../types/expense-capture.types";

export interface ExpenseRecord {
  id: string;
  projectId?: string;
  supplyId?: string;
  category: ExpenseCategory;
  supplier?: string;
  documentNumber?: string;
  occurredOn: string;
  subtotal?: number;
  vat?: number;
  total: number;
  currency: string;
  vehicleId?: string;
  receiptPath?: string;
  status: string;
  version: number;
}

export interface ExpenseDraft extends Omit<ExpenseRecord, "id" | "version" | "status"> { reason: string; }
export interface ExpenseUpdate extends Partial<Omit<ExpenseDraft, "reason">> { expenseId: string; expectedVersion: number; reason: string; }

export interface ExpenseRepository {
  findAll(): Promise<readonly ExpenseRecord[]>;
  create(input: ExpenseDraft): Promise<string>;
  update(input: ExpenseUpdate): Promise<void>;
  softDelete(expenseId: string, expectedVersion: number, reason: string): Promise<void>;
  restore(expenseId: string, expectedVersion: number, reason: string): Promise<void>;
}
