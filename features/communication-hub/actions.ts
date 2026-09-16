"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupabaseCommunicationTimelineRepository } from "./timeline/supabase-communication.timeline";
import { deliverWhatsAppOutboxMessage } from "@/features/connectors/whatsapp-cloud/whatsapp-outbox.sender";
import { WHATSAPP_TENANT_SLUG } from "@/features/connectors/whatsapp-cloud/whatsapp-tenant";

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
      summary: `Conversación tomada por ${actorLabel}. BIANCA pausada por control humano.`,
    });

    revalidatePath("/leads");
    return { ok: true as const, message: "Control humano activado. BIANCA quedó pausada." };
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
      summary: `Control devuelto a BIANCA por ${actorLabel}.`,
    });

    revalidatePath("/leads");
    return { ok: true as const, message: "BIANCA reactivada con el contexto actualizado." };
  } catch (error) {
    return fail(error, "No fue posible devolver la conversación a BIANCA.");
  }
}

export async function sendWhatsAppHumanMessageAction(conversationId: string, content: string) {
  try {
    await commercialActor();
    const body = content.trim();
    if (!body || body.length > 4096) throw new Error("El mensaje debe tener entre 1 y 4096 caracteres.");
    const client = createAdminClient();
    const { data: current, error: readError } = await client
      .from("conversation_states")
      .select("id,customer_id,status,nova_enabled,context")
      .eq("tenant_slug", WHATSAPP_TENANT_SLUG)
      .eq("id", conversationId)
      .single();
    if (readError) throw readError;
    if (current.status !== "HUMAN_HANDOFF" || current.nova_enabled !== false)
      throw new Error("El control humano debe estar activo para enviar desde el composer.");
    const participantId = typeof current.context?.externalParticipantId === "string" ? current.context.externalParticipantId : "";
    const lastInboundAt = typeof current.context?.lastMessageAt === "string" ? current.context.lastMessageAt : "";
    const serviceWindowExpiresAt = lastInboundAt ? new Date(new Date(lastInboundAt).getTime() + 24 * 60 * 60 * 1000).toISOString() : null;
    if (!participantId || !serviceWindowExpiresAt || new Date(serviceWindowExpiresAt).getTime() <= Date.now())
      throw new Error("La ventana de atención de 24 horas está cerrada; usa un template aprobado.");
    const correlationId = crypto.randomUUID();
    const { error: communicationError } = await client.from("communications").insert({
      tenant_slug: WHATSAPP_TENANT_SLUG,
      customer_id: current.customer_id,
      channel: "WHATSAPP_BUSINESS",
      direction: "OUTBOUND",
      communication_type: "HUMAN_RESPONSE",
      thread_key: conversationId,
      body,
      status: "QUEUED",
      external_message_id: correlationId,
      occurred_at: new Date().toISOString(),
    });
    if (communicationError) throw communicationError;
    const { error: outboxError } = await client.from("whatsapp_outbound_messages").insert({
      tenant_slug: WHATSAPP_TENANT_SLUG,
      correlation_id: correlationId,
      conversation_id: conversationId,
      customer_id: current.customer_id,
      recipient_wa_id: participantId,
      message_type: "text",
      message_mode: "TEXT",
      text_body: body,
      service_window_expires_at: serviceWindowExpiresAt,
      last_inbound_at: lastInboundAt,
      status: "PENDING",
      updated_at: new Date().toISOString(),
    });
    if (outboxError) throw outboxError;
    const delivery = await deliverWhatsAppOutboxMessage(correlationId);
    if (!delivery.ok) return delivery.blockedWindow ? fail(new Error("Ventana de 24 horas cerrada."), "No se envió el mensaje.") : fail(new Error(delivery.error), "No se envió el mensaje.");
    if ("disabled" in delivery && delivery.disabled) return fail(new Error("WhatsApp delivery está desactivado."), "WhatsApp delivery está desactivado.");
    revalidatePath("/leads");
    revalidatePath("/bianca");
    return { ok: true as const, message: "Mensaje enviado por WhatsApp." };
  } catch (error) {
    return fail(error, "No fue posible enviar el mensaje por WhatsApp.");
  }
}
