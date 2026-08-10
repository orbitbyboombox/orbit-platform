"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseCustomerRepository } from "../infrastructure";
import type { Project, ProjectDraft } from "../types/project";
import type { CustomerMutationInput } from "../infrastructure";

export type CreateCustomerResult = { ok: true; project: Project } | { ok: false; error: string };

function reservationErrorDetails(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return { code: value.code, message: value.message, details: value.details, hint: value.hint };
  }
  return { message: String(error) };
}

export async function createCustomerProjectAction(draft: ProjectDraft): Promise<CreateCustomerResult> {
  try {
    const repository = new SupabaseCustomerRepository(await createSupabaseServerClient());
    const project = await repository.createWithProject(draft);
    revalidatePath("/projects");
    return { ok: true, project };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "reservation.confirmation.failed", error: reservationErrorDetails(error), timestamp: new Date().toISOString() }));
    return { ok: false, error: "No pudimos confirmar la reserva. Revisa los datos e inténtalo nuevamente. Si el problema continúa, contacta al administrador de ORBIT." };
  }
}

async function customerRepository() {
  return new SupabaseCustomerRepository(await createSupabaseServerClient());
}

export async function updateCustomerAction(input: CustomerMutationInput): Promise<{ ok: boolean; error?: string }> {
  try { await (await customerRepository()).update(input); revalidatePath("/projects"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible actualizar el cliente." }; }
}

export async function softDeleteCustomerAction(customerId: string, expectedVersion: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  try { await (await customerRepository()).softDelete(customerId, expectedVersion, reason); revalidatePath("/projects"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible eliminar el cliente." }; }
}

export async function restoreCustomerAction(customerId: string, expectedVersion: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  try { await (await customerRepository()).restore(customerId, expectedVersion, reason); revalidatePath("/projects"); return { ok: true }; }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible restaurar el cliente." }; }
}

export async function softDeleteCustomerByProjectAction(projectId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.from("projects").select("customer_id,customers!inner(version)").eq("id", projectId).single();
    if (error || !data) throw error ?? new Error("No encontramos el cliente del evento.");
    const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers;
    await new SupabaseCustomerRepository(client).softDelete(data.customer_id, Number(customer?.version ?? 0), reason);
    revalidatePath("/projects");
    return { ok: true };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "No fue posible eliminar el cliente." }; }
}
