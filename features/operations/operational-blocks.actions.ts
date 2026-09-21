"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { validateOperationalBlock, type OperationalBlockStatus } from "./operational-blocks";
import { chileLocalToIso } from "./event-operational-window";

type Result = { ok: true; message: string } | { ok: false; error: string };

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => value(data, key) || null;
const fail = (error: unknown): Result => ({ ok: false, error: error instanceof Error ? error.message : "No fue posible actualizar los bloques." });

async function audit(client: Awaited<ReturnType<typeof createSupabaseServerActionClient>>, projectId: string, action: string, entityId: string, description: string) {
  const { data: project } = await client.from("projects").select("customer_id,orbit_event_id").eq("id", projectId).single();
  if (!project) return;
  const { error } = await client.from("timeline_events").insert({
    customer_id: project.customer_id,
    project_id: projectId,
    orbit_event_id: project.orbit_event_id,
    event_type: action,
    title: "Planificación operacional actualizada",
    description,
    actor_label: "Founder",
    source: "Operations",
    action,
    entity_type: "OperationalBlock",
    entity_id: entityId,
    human_message: description,
    correlation_id: `operational-block:${entityId}:${action}:${randomUUID()}`,
  });
  if (error) throw error;
}

function refresh(projectId: string) { revalidatePath(`/projects/${projectId}`); revalidatePath("/operations"); }

export async function saveOperationalBlockAction(data: FormData): Promise<Result> {
  try {
    const client = await createSupabaseServerActionClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Sesión requerida.");
    const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Solo Founder o Administración puede gestionar bloques.");
    const projectId = value(data, "projectId");
    const id = optional(data, "id");
    const name = value(data, "name");
    const startAt = value(data, "startAt");
    const endAt = value(data, "endAt");
    const errors = validateOperationalBlock({ name, startAt, endAt });
    if (!projectId || errors.length) throw new Error(errors[0] ?? "Bloque inválido.");
    const payload = { project_id: projectId, name, start_at: chileLocalToIso(startAt), end_at: chileLocalToIso(endAt), notes: optional(data, "notes"), status: (optional(data, "status") || "PLANNING") as OperationalBlockStatus };
    const query = id ? client.from("event_operational_blocks").update(payload).eq("id", id).eq("project_id", projectId).select("id").single() : client.from("event_operational_blocks").insert({ ...payload, sequence: Number(value(data, "sequence") || 1) }).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw error;
    await audit(client, projectId, id ? "OPERATIONAL_BLOCK_UPDATED" : "OPERATIONAL_BLOCK_CREATED", saved.id, `${name}: ${startAt} → ${endAt}.`);
    refresh(projectId);
    return { ok: true, message: id ? "Bloque actualizado." : "Bloque agregado." };
  } catch (error) { return fail(error); }
}

export async function deleteOperationalBlockAction(projectId: string, blockId: string): Promise<Result> {
  try {
    const client = await createSupabaseServerActionClient();
    const { error } = await client.rpc("delete_event_operational_block", { p_project_id: projectId, p_block_id: blockId });
    if (error) throw error;
    await audit(client, projectId, "OPERATIONAL_BLOCK_DELETED", blockId, "Bloque operacional eliminado.");
    refresh(projectId);
    return { ok: true, message: "Bloque eliminado." };
  } catch (error) { return fail(error); }
}

export async function reorderOperationalBlocksAction(projectId: string, orderedIds: string[]): Promise<Result> {
  try {
    const client = await createSupabaseServerActionClient();
    const { error } = await client.rpc("reorder_event_operational_blocks", { p_project_id: projectId, p_ordered_ids: orderedIds });
    if (error) throw error;
    await audit(client, projectId, "OPERATIONAL_BLOCKS_REORDERED", projectId, "Orden de bloques operacionales actualizado.");
    refresh(projectId);
    return { ok: true, message: "Orden actualizado." };
  } catch (error) { return fail(error); }
}
