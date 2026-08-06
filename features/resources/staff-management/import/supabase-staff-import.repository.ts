import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffImportRow } from "./types";

export class SupabaseStaffImportRepository {
  constructor(private readonly client: SupabaseClient) {}
  async import(rows: readonly StaffImportRow[]): Promise<number> {
    const ruts = rows.map((row) => row.rut);
    const { data: existing, error: existingError } = await this.client.from("staff").select("rut").in("rut", ruts).is("deleted_at", null);
    if (existingError) throw existingError;
    if (existing?.length) throw new Error(`Ya existe Staff con RUT: ${existing.map((row) => row.rut).join(", ")}.`);
    const payload = rows.map((row) => ({ employeeCode: row.employeeCode, firstName: row.firstName, lastName: row.lastName, rut: row.rut, phone: row.phone, email: row.email, status: row.status, roleClassification: row.roleClassification, capabilities: row.capabilities, notes: row.notes, bank: row.bank, accountNumber: row.accountNumber, emergencyContact: row.emergencyContact }));
    const { data, error } = await this.client.rpc("import_staff", { p_rows: payload });
    if (error) throw error;
    return Number(data ?? 0);
  }
}
