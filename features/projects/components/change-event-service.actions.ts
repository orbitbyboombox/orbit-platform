"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";

export async function changeEventContractedServiceAction(input: {
  projectId: string;
  service: string;
  reason: string;
}) {
  try {
    const client = await createSupabaseServerActionClient();
    const { error } = await client.rpc("change_event_contracted_service", {
      p_project_id: input.projectId,
      p_new_service: input.service,
      p_reason: input.reason,
    });
    if (error) throw error;
    revalidatePath("/projects");
    revalidatePath("/events");
    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible cambiar el servicio." };
  }
}
