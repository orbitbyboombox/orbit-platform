"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseCustomerRepository } from "../infrastructure";
import type { Project, ProjectDraft } from "../types/project";
import type { CustomerMutationInput } from "../infrastructure";

export type CreateCustomerResult = { ok: true; project: Project } | { ok: false; error: string };

export async function createCustomerProjectAction(draft: ProjectDraft): Promise<CreateCustomerResult> {
  try {
    const repository = new SupabaseCustomerRepository(await createSupabaseServerClient());
    const project = await repository.createWithProject(draft);
    revalidatePath("/projects");
    return { ok: true, project };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "customer.create.failed", message: error instanceof Error ? error.message : "Unknown error", timestamp: new Date().toISOString() }));
    return { ok: false, error: error instanceof Error ? error.message : "No fue posible crear el cliente." };
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
