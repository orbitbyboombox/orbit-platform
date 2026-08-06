"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateStaffImportRows } from "./staff-import.validator";
import { SupabaseStaffImportRepository } from "./supabase-staff-import.repository";
import type { StaffImportRow } from "./types";

export async function importStaffRowsAction(rows: readonly StaffImportRow[]): Promise<{ ok: true; imported: number } | { ok: false; error: string }> {
  try {
    const preview = validateStaffImportRows(rows.map((row) => ({ "Employee Code": row.employeeCode, "First Name": row.firstName, "Last Name": row.lastName, RUT: row.rut, Phone: row.phone, Email: row.email, Status: row.status, "Role Classification": row.roleClassification, Capabilities: row.capabilities.join(","), Notes: row.notes, Bank: row.bank, "Account Number": row.accountNumber, "Emergency Contact": row.emergencyContact })));
    if (!preview.valid) return { ok: false, error: preview.issues[0]?.message ?? "La importación contiene errores." };
    const imported = await new SupabaseStaffImportRepository(await createSupabaseServerClient()).import(preview.rows);
    revalidatePath("/resources/staff");
    return { ok: true, imported };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible importar Staff." }; }
}
