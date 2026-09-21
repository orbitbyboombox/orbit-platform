"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { synchronizeConfirmedReservationCalendar } from "@/features/connectors/google-calendar/application/google-calendar-sync.service";
import { deliverAssignmentCancellationBoundary } from "@/features/operations/staff-assignment-cancellation.service";
import { requestEvidence } from "@/features/portal-authentication/portal-auth.service";
import {deliverStaffAssignmentNotification} from "@/features/operations/staff-assignment-notification.service";
import {calculateStaffCallAt, chileLocalToIso} from "@/features/operations/event-operational-window";
import { invalidateCalendarSyncForProject } from "@/features/connectors/google-calendar/application/google-calendar-resync.service";

export type StaffAssignmentMutation = {
  requestId?: string;
  id?: string;
  projectId: string;
  blockId?: string;
  staffId: string;
  role: string;
  arrivalTime: string;
  staffCallAt?: string;
  startTime: string;
  finishTime: string;
  vehicleId: string;
  observations: string;
  replaceId?: string;
};
type Result = { ok: true } | { ok: false; error: string };

const allowedRoles = ["OPERATOR", "ASSEMBLY", "DISASSEMBLY"];
const allowedStatuses = [
  "ASSIGNED",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
];
const value = (input: string) => input.trim() || null;
const friendly = (error: unknown, fallback: string) =>
  error instanceof Error &&
  error.message &&
  !/invalid|violates|constraint|uuid|postgres|supabase/i.test(error.message)
    ? error.message
    : fallback;

async function context(projectId: string) {
  const client = await createSupabaseServerActionClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role))
    throw new Error("Solo Administración puede gestionar asignaciones.");
  const { data: project, error } = await client
    .from("projects")
    .select(
      "id,customer_id,orbit_event_id,name,event_date,event_time,project_services(duration_hours),event_operational_blocks(id,start_at,end_at,name)",
    )
    .eq("id", projectId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return { client, user: data.user, project };
}

async function timeline(
  ctx: Awaited<ReturnType<typeof context>>,
  assignmentId: string,
  action: string,
  message: string,
  staffId: string,
) {
  const { error } = await ctx.client
    .from("timeline_events")
    .insert({
      customer_id: ctx.project.customer_id,
      project_id: ctx.project.id,
      staff_id: staffId,
      orbit_event_id: ctx.project.orbit_event_id,
      actor_id: ctx.user.id,
      actor_label: ctx.user.email ?? "Administración",
      source: "Operations",
      action,
      entity_type: "Assignment",
      entity_id: assignmentId,
      event_type: action,
      title: message,
      description: message,
      human_message: message,
      correlation_id: `staff-assignment:${assignmentId}:${action}:${crypto.randomUUID()}`,
      created_by: ctx.user.id,
    });
  if (error) throw error;
}

export async function saveStaffAssignmentAction(
  input: StaffAssignmentMutation,
): Promise<Result> {
  try {
    if (
      !allowedRoles.includes(input.role) ||
      !input.staffId ||
      !input.projectId
    )
      throw new Error("Selecciona Staff, rol y evento.");
    const ctx = await context(input.projectId);
    const selectedBlock = input.blockId
      ? (Array.isArray(ctx.project.event_operational_blocks)
          ? ctx.project.event_operational_blocks
          : ctx.project.event_operational_blocks
            ? [ctx.project.event_operational_blocks]
            : []
        ).find((block) => block.id === input.blockId)
      : null;
    const eventStart = selectedBlock
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: "America/Santiago",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(new Date(selectedBlock.start_at))
      : ctx.project.event_time?.slice(0, 5) ?? "";
    const service = Array.isArray(ctx.project.project_services)
      ? ctx.project.project_services[0]
      : ctx.project.project_services;
    const duration = Math.max(0, Number(service?.duration_hours ?? 0));
    const clock = (base: string, minutes: number) => {
      if (!base) return null;
      const [h, m] = base.split(":").map(Number);
      const total = (h * 60 + m + minutes + 1440) % 1440;
      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    };
    const automaticArrival =
      input.role === "OPERATOR" && ctx.project.event_date && eventStart
        ? calculateStaffCallAt(chileLocalToIso(`${ctx.project.event_date}T${eventStart}:00`))
        : null;
    const automaticFinish = clock(eventStart, duration * 60);
    const payload = {
      project_id: input.projectId,
      block_id: input.blockId || null,
      staff_id: input.staffId,
      assignment_type: input.role,
      status: "ASSIGNED",
      arrival_time: value(input.arrivalTime) ?? (automaticArrival ? clock(eventStart, -60) : null),
      staff_call_at:value(input.staffCallAt??"")||automaticArrival,
      staff_call_source:value(input.staffCallAt??"")?"FOUNDER_OVERRIDE":(automaticArrival?"DEFAULT_60_MINUTES":null),
      start_time: value(input.startTime) ?? value(eventStart),
      finish_time: value(input.finishTime) ?? automaticFinish,
      assigned_vehicle: value(input.vehicleId),
      observations: value(input.observations),
      resources: { vehicle: value(input.vehicleId) },
      reason: value(input.observations) ?? "Asignación operacional",
      updated_by: ctx.user.id,
    };
    const { data: saved, error: saveError } = await ctx.client.rpc("save_event_staff_assignment", {
      p_payload: payload,
      p_assignment_id: input.id ?? null,
      p_request_id: input.requestId ?? crypto.randomUUID(),
      p_replace_id: input.replaceId ?? null,
    });
    if (saveError) throw new Error(saveError.message);
    const result = saved as { id: string; replay: boolean };
    const assignmentId = result.id;
    if (!result.replay) {
      await timeline(
        ctx,
        assignmentId,
        input.id ? "STAFF_ASSIGNMENT_UPDATED" : input.replaceId ? "STAFF_REPLACED" : "STAFF_ASSIGNED",
        input.id ? "Asignación de Staff actualizada." : input.replaceId
          ? "Staff reemplazado en el evento."
          : "Staff asignado al evento.",
        input.staffId,
      );
    }
    try{await deliverStaffAssignmentNotification(ctx.client,assignmentId)}catch(notificationError){console.error("[ORBIT][STAFF_ASSIGNMENT_NOTIFICATION]",{assignmentId,error:notificationError instanceof Error?notificationError.message:String(notificationError)})}
    await invalidateCalendarSyncForProject(ctx.client, input.projectId);
    await synchronizeConfirmedReservationCalendar({
      client: ctx.client,
      projectId: input.projectId,
      actorId: ctx.user.id,
      policy: "EXISTING_LEGACY_UPDATE",
    });
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath("/resources/staff");
    revalidatePath("/customers", "layout");
    revalidatePath("/finance");
    revalidatePath("/reports");
    revalidatePath("/operations");
    revalidatePath("/notifications");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: friendly(error, "No fue posible guardar la asignación."),
    };
  }
}

export async function updateStaffAssignmentStatusAction(input: {
  id: string;
  projectId: string;
  status: string;
}): Promise<Result> {
  try {
    if (!allowedStatuses.includes(input.status))
      throw new Error("Estado de asignación no válido.");
    const ctx = await context(input.projectId);
    const { data: item, error } = await ctx.client
      .from("assignments")
      .update({
        status: input.status,
        accepted_at:
          input.status === "CONFIRMED" ? new Date().toISOString() : undefined,
        response_at: ["CONFIRMED", "CANCELLED"].includes(input.status)
          ? new Date().toISOString()
          : undefined,
        updated_by: ctx.user.id,
      })
      .eq("id", input.id)
      .eq("project_id", input.projectId)
      .is("deleted_at", null)
      .select("staff_id")
      .single();
    if (error) throw error;
    const map: Record<string, [string, string]> = {
      CONFIRMED: ["STAFF_CONFIRMED", "Asignación de Staff confirmada."],
      COMPLETED: ["STAFF_COMPLETED", "Asignación de Staff completada."],
      CANCELLED: ["STAFF_REMOVED", "Staff removido del evento."],
      ASSIGNED: ["STAFF_ASSIGNED", "Staff asignado al evento."],
      PENDING_CONFIRMATION: [
        "STAFF_CONFIRMATION_PENDING",
        "Confirmación de Staff pendiente.",
      ],
    };
    const [action, message] = map[input.status];
    await timeline(ctx, input.id, action, message, item.staff_id);
    await invalidateCalendarSyncForProject(ctx.client, input.projectId);
    await synchronizeConfirmedReservationCalendar({
      client: ctx.client,
      projectId: input.projectId,
      actorId: ctx.user.id,
      policy: "EXISTING_LEGACY_UPDATE",
    });
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath("/resources/staff");
    revalidatePath("/customers", "layout");
    revalidatePath("/finance");
    revalidatePath("/reports");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: friendly(error, "No fue posible actualizar la asignación."),
    };
  }
}

export async function cancelStaffAssignmentByFounderAction(input: {
  id: string;
  projectId: string;
  reasonCategory: string;
  reasonDetail: string;
}): Promise<Result> {
  try {
    const ctx = await context(input.projectId);
    const evidence = requestEvidence(await headers());
    if (!input.reasonCategory)
      throw new Error("Selecciona el motivo de cancelación.");
    const { data: cancellationId, error } = await ctx.client.rpc(
      "cancel_staff_assignment_by_founder",
      {
        p_assignment_id: input.id,
        p_reason_category: input.reasonCategory,
        p_reason_detail: input.reasonDetail.trim(),
        p_device: evidence.device,
        p_ip_hash: evidence.ipHash,
        p_user_agent: evidence.userAgent,
      },
    );
    if (error || !cancellationId)
      throw error ?? new Error("No fue posible registrar la cancelación.");
    let boundaryFailures: unknown[] = [];
    try {
      const boundary = await deliverAssignmentCancellationBoundary(
        ctx.client,
        String(cancellationId),
      );
      boundaryFailures = boundary.failed;
    } catch (boundaryError) {
      boundaryFailures = [boundaryError];
      console.error("[ORBIT][STAFF_CANCELLATION_BOUNDARY]", {
        cancellationId,
        stage: "load",
        error:
          boundaryError instanceof Error
            ? boundaryError.message
            : String(boundaryError),
      });
    }
    try {
      await synchronizeConfirmedReservationCalendar({
        client: ctx.client,
        projectId: input.projectId,
        actorId: ctx.user.id,
      policy: "EXISTING_LEGACY_UPDATE",
      });
    } catch (calendarError) {
      console.error("[ORBIT][STAFF_CANCELLATION_BOUNDARY]", {
        cancellationId,
        stage: "calendar",
        error:
          calendarError instanceof Error
            ? calendarError.message
            : String(calendarError),
      });
    }
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath("/staff-portal");
    revalidatePath("/operations");
    revalidatePath("/resources/staff");
    revalidatePath("/finance");
    revalidatePath("/reports");
    if (boundaryFailures.length)
      console.error("[ORBIT][STAFF_CANCELLATION_BOUNDARY_INCOMPLETE]", {
        cancellationId,
        failed: boundaryFailures,
      });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: friendly(error, "No fue posible cancelar la asignación."),
    };
  }
}
