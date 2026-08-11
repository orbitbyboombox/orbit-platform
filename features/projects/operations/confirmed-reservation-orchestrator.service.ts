import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createCustomerPortalAccess } from "@/features/customer-portal/customer-portal.service";
import {
  deliverConfirmedReservationEmail,
  deliverFounderReservationNotification,
} from "@/features/connectors/google-gmail/application/google-gmail-delivery.service";
import {
  runConfirmedReservationOperationalPipeline,
  type OperationalPipelineStage,
} from "./confirmed-reservation-pipeline.service";

export type ConfirmationStage =
  | "RECORDS"
  | OperationalPipelineStage
  | "PORTAL"
  | "CUSTOMER_EMAIL"
  | "FOUNDER_EMAIL"
  | "DASHBOARD";

export async function confirmPersistedReservation(input: {
  client: SupabaseClient;
  projectId: string;
  actorId: string;
  portal?: { url: string; expiresAt: string };
  completedStages?: ReadonlySet<ConfirmationStage>;
  onStage?: (
    stage: ConfirmationStage,
    status: "STARTED" | "PASS",
  ) => void | Promise<void>;
}) {
  const done = input.completedStages ?? new Set<ConfirmationStage>();
  let portal = input.portal;

  if (!done.has("RECORDS")) {
    await input.onStage?.("RECORDS", "STARTED");
    const { error } = await input.client.rpc(
      "prepare_confirmed_reservation_records",
      { p_project_id: input.projectId, p_actor_id: input.actorId },
    );
    if (error) throw error;
    await input.onStage?.("RECORDS", "PASS");
  }

  if (!done.has("PORTAL")) {
    await input.onStage?.("PORTAL", "STARTED");
    portal ??= await createCustomerPortalAccess(input.projectId, input.actorId);
    await input.onStage?.("PORTAL", "PASS");
  }

  await runConfirmedReservationOperationalPipeline({
    client: input.client,
    projectId: input.projectId,
    actorId: input.actorId,
    completedStages: new Set(
      (["BUSINESS_ENGINE", "GOOGLE_CALENDAR", "GOOGLE_DRIVE"] as const).filter(
        (stage) => done.has(stage),
      ),
    ),
    onStage: input.onStage,
  });

  if (!done.has("CUSTOMER_EMAIL")) {
    await input.onStage?.("CUSTOMER_EMAIL", "STARTED");
    const delivery = await deliverConfirmedReservationEmail({
      projectId: input.projectId,
      actorId: input.actorId,
      portal,
    });
    if (delivery.status !== "SENT")
      throw new Error("El documento oficial aún no está listo para enviar.");
    await input.onStage?.("CUSTOMER_EMAIL", "PASS");
  }

  if (!done.has("FOUNDER_EMAIL")) {
    await input.onStage?.("FOUNDER_EMAIL", "STARTED");
    const founder = await deliverFounderReservationNotification({
      projectId: input.projectId,
      actorId: input.actorId,
    });
    if (founder.status === "FAILED")
      throw new Error("La notificación del Founder no pudo ser entregada.");
    await input.onStage?.("FOUNDER_EMAIL", "PASS");
  }

  if (!done.has("DASHBOARD")) {
    await input.onStage?.("DASHBOARD", "STARTED");
    const { data: project, error: projectError } = await input.client
      .from("projects")
      .select("customer_id,orbit_event_id,name,project_services(service_code)")
      .eq("id", input.projectId)
      .single();
    if (projectError) throw projectError;
    const { error } = await input.client.from("internal_notifications").upsert(
      {
        project_id: input.projectId,
        customer_id: project.customer_id,
        notification_type: "RESERVATION_CONFIRMED",
        title: "🎉 Nueva Reserva Confirmada",
        message: `${project.name} · ${(project.project_services ?? []).map((service) => service.service_code).join(" + ")}`,
        status: "UNREAD",
        correlation_id: `reservation-confirmed:${input.projectId}`,
        category: "COMMERCIAL",
        priority: "HIGH",
        action_required: false,
        entity_type: "Project",
        entity_id: input.projectId,
        related_href: `/projects/${input.projectId}`,
      },
      { onConflict: "correlation_id" },
    );
    if (error) throw error;
    await input.onStage?.("DASHBOARD", "PASS");
  }

  return { portal };
}
