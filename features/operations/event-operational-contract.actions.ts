"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";

type Result = { ok: true; message: string } | { ok: false; error: string };

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => value(data, key) || null;

export async function updateEventOperationalContractAction(data: FormData): Promise<Result> {
  try {
    const projectId = value(data, "projectId");
    if (!projectId) throw new Error("Evento no identificado.");
    const client = await createSupabaseServerActionClient();
    const { error } = await client.rpc("update_event_operational_contract", {
      p_project_id: projectId,
      p_changes: {
        contactFirstName: optional(data, "contactFirstName"),
        contactLastName: optional(data, "contactLastName"),
        contactPhone: optional(data, "contactPhone"),
        contactEmail: optional(data, "contactEmail"),
        contactRole: optional(data, "contactRole"),
        contactNotes: optional(data, "contactNotes"),
        staffArrivalAt: optional(data, "staffArrivalAt"),
        assemblyStartAt: optional(data, "assemblyStartAt"),
        serviceStartAt: optional(data, "serviceStartAt"),
        serviceEndAt: optional(data, "serviceEndAt"),
        disassemblyStartAt: optional(data, "disassemblyStartAt"),
        operationalEndAt: optional(data, "operationalEndAt"),
        accessInstructions: optional(data, "accessInstructions"),
        operationalNotes: optional(data, "operationalNotes"),
      },
    });
    if (error) throw error;
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/operations");
    return { ok: true, message: "Operación actualizada y readiness recalculado." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No fue posible actualizar la Operación." };
  }
}
