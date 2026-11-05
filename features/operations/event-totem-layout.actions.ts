"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { validateTotemLayout, type EventTotemLayout } from "./event-totem-layout";

/** Save only the event's optional layout, preserving all other operational fields. */
export async function saveEventTotemLayoutAction(projectId: string, layout: EventTotemLayout) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(projectId)) throw new Error("Invalid event ID");
  const client = await createSupabaseServerActionClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("Authentication required");
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profileError || profile?.role !== "CEO") throw new Error("Admin authorization required");
  const [{ data: project, error: projectError }, { data: blocks, error: blocksError }, { data: assignments, error: assignmentsError }, { data: assets, error: assetsError }] = await Promise.all([
    client.from("projects").select("id,operations").eq("id", projectId).is("deleted_at", null).single(),
    client.from("event_operational_blocks").select("id").eq("project_id", projectId),
    client.from("assignments").select("id,block_id").eq("project_id", projectId).is("deleted_at", null),
    client.from("operational_assets").select("id"),
  ]);
  if (projectError || !project || blocksError || assignmentsError || assetsError) throw new Error("Unable to load event assignment references");
  const errors = validateTotemLayout(layout, {
    assetIds: new Set((assets ?? []).map(item => item.id)),
    blockIds: new Set((blocks ?? []).map(item => item.id)),
    assignmentBlockIds: new Map((assignments ?? []).filter(item => item.block_id).map(item => [item.id, item.block_id!])),
  });
  if (errors.length) throw new Error(errors.join("; "));
  const operations = project.operations && typeof project.operations === "object" && !Array.isArray(project.operations) ? project.operations : {};
  // Optimistic compare prevents overwriting edits to other operational fields made since this read.
  const { data: saved, error: saveError } = await client.from("projects")
    .update({ operations: { ...operations, totemLayout: layout } })
    .eq("id", projectId).eq("operations", operations).select("id").maybeSingle();
  if (saveError) throw new Error("Could not save layout");
  if (!saved) throw new Error("Event was changed by someone else. Reload before saving.");
  revalidatePath("/admin");
  return { ok: true };
}
