"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseCommunicationTimelineRepository } from "./timeline/supabase-communication.timeline";

const ALLOWED_ROLES = new Set(["CEO", "ADMINISTRATOR", "SALES"]);

async function commercialActor() {
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Sesión requerida.");

  const { data: profile, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (error) throw error;
  if (!profile || !ALLOWED_ROLES.has(profile.role))
    throw new Error("No tienes permiso para controlar conversaciones.");

  return {
    client,
    userId: data.user.id,
    actorLabel: data.user.email ?? profile.role ?? "BOOMBOX",
  };
}

const fail = (error: unknown, fallback: string) => ({
  ok: false as const,
  error: error instanceof Error ? error.message : fallback,
});

export async function takeCommunicationConversationAction(conversationId: string) {
  try {
    const { client, userId, actorLabel } = await commercialActor();
    const { data: current, error: readError } = await client
      .from("conversation_states")
      .select("id,customer_id,status,nova_enabled,human_owner_id,context")
      .eq("id", conversationId)
      .single();
    if (readError) throw readError;

    const now = new Date().toISOString();
    const context = (current.context ?? {}) as Record<string, unknown>;
    const { error } = await client
      .from("conversation_states")
      .update({
        status: "HUMAN_HANDOFF",
        nova_enabled: false,
        human_owner_id: userId,
        updated_at: now,
        context: {
          ...context,
          humanTakeover: {
            active: true,
            actorId: userId,
            actorLabel,
            takenAt: now,
          },
        },
      })
      .eq("id", conversationId);
    if (error) throw error;

    const timeline = new SupabaseCommunicationTimelineRepository(client);
    await timeline.append({
      id: `handoff-${conversationId}-${Date.now()}`,
      conversationId,
      customerId: current.customer_id,
      channel: "FUTURE",
      direction: "SYSTEM",
      type: "HUMAN_HANDOFF",
      occurredAt: now,
      summary: `Conversación tomada por ${actorLabel}. NOVA pausada por control humano.`,
    });

    revalidatePath("/leads");
    return { ok: true as const, message: "Control humano activado. NOVA quedó pausada." };
  } catch (error) {
    return fail(error, "No fue posible tomar el control de la conversación.");
  }
}

export async function releaseCommunicationConversationAction(conversationId: string) {
  try {
    const { client, userId, actorLabel } = await commercialActor();
    const { data: current, error: readError } = await client
      .from("conversation_states")
      .select("id,customer_id,status,nova_enabled,human_owner_id,context")
      .eq("id", conversationId)
      .single();
    if (readError) throw readError;

    const now = new Date().toISOString();
    const context = (current.context ?? {}) as Record<string, unknown>;
    const previousTakeover = context.humanTakeover && typeof context.humanTakeover === "object"
      ? context.humanTakeover as Record<string, unknown>
      : {};
    const { error } = await client
      .from("conversation_states")
      .update({
        status: "ACTIVE",
        nova_enabled: true,
        human_owner_id: null,
        updated_at: now,
        context: {
          ...context,
          humanTakeover: {
            ...previousTakeover,
            active: false,
            releasedById: userId,
            releasedByLabel: actorLabel,
            releasedAt: now,
          },
        },
      })
      .eq("id", conversationId);
    if (error) throw error;

    const timeline = new SupabaseCommunicationTimelineRepository(client);
    await timeline.append({
      id: `handoff-release-${conversationId}-${Date.now()}`,
      conversationId,
      customerId: current.customer_id,
      channel: "FUTURE",
      direction: "SYSTEM",
      type: "HUMAN_HANDOFF_RELEASED",
      occurredAt: now,
      summary: `Control devuelto a NOVA por ${actorLabel}.`,
    });

    revalidatePath("/leads");
    return { ok: true as const, message: "NOVA reactivada con el contexto actualizado." };
  } catch (error) {
    return fail(error, "No fue posible devolver la conversación a NOVA.");
  }
}
