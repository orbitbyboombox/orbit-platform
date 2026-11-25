"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { getTotemFinalizationWarnings, validateTotemLayout, type EventTotemLayout } from "./event-totem-layout";

/** Save only the event's optional layout, preserving all other operational fields. */
export async function saveEventTotemLayoutAction(projectId: string, layout: EventTotemLayout, finalize = false) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(projectId)) throw new Error("Invalid event ID");
  const client = await createSupabaseServerActionClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("Authentication required");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profileError || profile?.role !== "CEO") throw new Error("Admin authorization required");
  const [{ data: blocks, error: blocksError }, { data: assignments, error: assignmentsError }, { data: assets, error: assetsError }] = await Promise.all([
    client.from("event_operational_blocks").select("id").eq("project_id", projectId),
    client.from("assignments").select("id,block_id,assignment_type,status").eq("project_id", projectId).is("deleted_at", null).in("status", ["ASSIGNED", "PENDING_CONFIRMATION", "ACCEPTED", "CONFIRMED"]),
    client.from("operational_assets").select("id").eq("asset_type", "CASE"),
  ]);
  if (blocksError || assignmentsError || assetsError) throw new Error("Unable to load event assignment references");
  const errors = validateTotemLayout(layout, {
    assetIds: new Set((assets ?? []).map(item => item.id)),
    blockIds: new Set((blocks ?? []).map(item => item.id)),
    assignmentBlockIds: new Map((assignments ?? []).filter(item => item.assignment_type === "OPERATOR").map(item => [item.id, item.block_id])),
  });
  if (errors.length) throw new Error(errors.join("; "));
  if (finalize) {
    const warnings = getTotemFinalizationWarnings(layout, (assignments ?? []).filter(item => item.assignment_type === "OPERATOR").map(item => ({ id: item.id, blockId: item.block_id, assignmentType: item.assignment_type })), new Set((blocks ?? []).map(item => item.id)));
    if (warnings.length) throw new Error(warnings.join("; "));
  }
  layout = { ...layout, finalized: finalize };
  const { data: saved, error: saveError } = await client.rpc("save_event_multicase_configuration", { p_project_id: projectId, p_layout: layout });
  if (saveError) throw new Error(saveError.message || "Could not save Multicaja configuration");
  revalidatePath("/admin");
  revalidatePath("/admin/totems");
  revalidatePath(`/admin/totems/${projectId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/operations");
  revalidatePath("/staff-portal");
  revalidatePath("/resources/boxes");
  return { ok: true, layout: (saved as { layout?: EventTotemLayout } | null)?.layout ?? layout };
}
