"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidateCalendarSyncForProject } from "@/features/connectors/google-calendar/application/google-calendar-resync.service";

async function adminClient() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sesión requerida.");
  const { data: profile, error } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (error) throw error;
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Founder o Administración puede agregar extras.");
  return { client, userId: auth.user.id };
}

export async function addEventPostReservationExtraAction(input: {
  projectId: string;
  commercialPriceId?: string;
  name?: string;
  description?: string;
  amount?: number;
  source: "CATALOG" | "CUSTOM";
  reason?: string;
}) {
  const { client } = await adminClient();
  const { data, error } = await client.rpc("add_event_post_reservation_extra", {
    p_project_id: input.projectId,
    p_commercial_price_id: input.commercialPriceId ?? null,
    p_name: input.name?.trim() || null,
    p_description: input.description?.trim() || "",
    p_amount: input.amount ?? null,
    p_source: input.source,
    p_reason: input.reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
  await invalidateCalendarSyncForProject(client, input.projectId);
  revalidatePath(`/projects/${input.projectId}`);
  return data as { id: string; total: number; paid: number; balance: number; extras_total: number };
}
