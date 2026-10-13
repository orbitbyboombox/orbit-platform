"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { synchronizeConfirmedReservationCalendar } from "@/features/connectors/google-calendar/application/google-calendar-sync.service";
import { deliverAssignmentCancellationBoundary } from "@/features/operations/staff-assignment-cancellation.service";
import { requestEvidence } from "@/features/portal-authentication/portal-auth.service";
import {deliverStaffAssignmentNotification} from "@/features/operations/staff-assignment-notification.service";

export type StaffAssignmentMutation = {
  id?: string;
  projectId: string;
  staffId: string;
  role: string;
  arrivalTime: string;
  staffCallAt?: string;
  startTime: string;
  finishTime: string;
  vehicleId: string;
  observations: string;
  replaceId?: string;
  blockId?: string;
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
      "id,customer_id,orbit_event_id,name,event_time,project_services(duration_hours)",
    )
    .eq("id", projectId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return { client, user: data.user, project };
}

export type OperationalBlockRecord = { id: string; name: string; sequence: number; startAt: string; endAt: string; status: string };
export async function listEventOperationalBlocksAction(projectId: string): Promise<OperationalBlockRecord[]> {
  const ctx = await context(projectId);
  const { data, error } = await ctx.client.from("event_operational_blocks")
    .select("id,name,sequence,start_at,end_at,status")
    .eq("project_id", projectId).order("sequence", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id, name: row.name, sequence: row.sequence,
    startAt: row.start_at, endAt: row.end_at, status: row.status,
  }));
}
export async function createEventOperationalBlockAction(input: {
  projectId: string; name: string; startAt: string; endAt: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await context(input.projectId);
    const name = input.name.trim();
    if (!name || name.length > 90) throw new Error("Ingresa un nombre válido para el bloque.");
    const start = new Date(input.startAt);
    const end = new Date(input.endAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start)
      throw new Error("El término del bloque debe ser posterior a su inicio.");
    if (end.getTime() - start.getTime() > 24 * 60 * 60 * 1000)
      throw new Error("El bloque no puede durar más de 24 horas.");
    const { data: previous, error: orderError } = await ctx.client
      .from("event_operational_blocks").select("sequence")
      .eq("project_id", input.projectId).order("sequence", { ascending: false }).limit(1);
    if (orderError) throw orderError;
    const sequence = (previous?.[0]?.sequence ?? 0) + 1;
    const { error } = await ctx.client.from("event_operational_blocks").insert({
      project_id: input.projectId, name, sequence,
      start_at: start.toISOString(), end_at: end.toISOString(), status: "PLANNING",
    });
    if (error) throw error;
    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendly(error, "No fue posible crear el bloque.") };
  }
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
    let selectedBlock: { id: string; start_at: string; end_at: string } | null = null;
    if (input.blockId?.trim()) {
      const { data: block, error: blockError } = await ctx.client
        .from("event_operational_blocks").select("id,start_at,end_at")
        .eq("id", input.blockId).eq("project_id", input.projectId).single();
      if (blockError || !block) throw new Error("El bloque seleccionado no pertenece al evento.");
      selectedBlock = block;
    }
    const chileTime = (timestamp: string) => new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date(timestamp));
    const eventStart = ctx.project.event_time?.slice(0, 5) ?? "";
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
    const blockStart = selectedBlock ? chileTime(selectedBlock.start_at) : eventStart;
    const blockFinish = selectedBlock ? chileTime(selectedBlock.end_at) : null;
    const automaticArrival =
      input.role === "OPERATOR" ? clock(blockStart, -90) : null;
    const automaticFinish = blockFinish ?? clock(eventStart, duration * 60);
    const payload = {
      project_id: input.projectId,
      staff_id: input.staffId,
      assignment_type: input.role,
      block_id: selectedBlock?.id ?? null,
      status: "ASSIGNED",
      arrival_time: value(input.arrivalTime) ?? automaticArrival,
      staff_call_at:value(input.staffCallAt??""),
      staff_call_source:value(input.staffCallAt??"")?"MANUAL_OVERRIDE":null,
      start_time: value(input.startTime) ?? value(blockStart),
      finish_time: value(input.finishTime) ?? automaticFinish,
      assigned_vehicle: value(input.vehicleId),
      observations: value(input.observations),
      resources: { vehicle: value(input.vehicleId) },
      reason: value(input.observations) ?? "Asignación operacional",
      updated_by: ctx.user.id,
    };
    let assignmentId=input.id??"";
    if (input.replaceId) {
      const { data: old, error: oldError } = await ctx.client
        .from("assignments")
        .update({
          status: "CANCELLED",
          deleted_at: new Date().toISOString(),
          updated_by: ctx.user.id,
          reason: "Staff reemplazado",
        })
        .eq("id", input.replaceId)
        .eq("project_id", input.projectId)
        .is("deleted_at", null)
        .select("id,staff_id")
        .single();
      if (oldError) throw oldError;
      await timeline(
        ctx,
        old.id,
        "STAFF_REMOVED",
        "Staff anterior removido por reemplazo.",
        old.staff_id,
      );
    }
    if (input.id) {
      const { error } = await ctx.client
        .from("assignments")
        .update(payload)
        .eq("id", input.id)
        .eq("project_id", input.projectId)
        .is("deleted_at", null);
      if (error) throw error;
      assignmentId=input.id;
      await timeline(
        ctx,
        input.id,
        "STAFF_ASSIGNMENT_UPDATED",
        "Asignación de Staff actualizada.",
        input.staffId,
      );
    } else {
      const { data: created, error } = await ctx.client
        .from("assignments")
        .insert({ ...payload, created_by: ctx.user.id })
        .select("id")
        .single();
      if (error) throw error;
      assignmentId=created.id;
      await timeline(
        ctx,
        created.id,
        input.replaceId ? "STAFF_REPLACED" : "STAFF_ASSIGNED",
        input.replaceId
          ? "Staff reemplazado en el evento."
          : "Staff asignado al evento.",
        input.staffId,
      );
    }
    try{await deliverStaffAssignmentNotification(ctx.client,assignmentId)}catch(notificationError){console.error("[ORBIT][STAFF_ASSIGNMENT_NOTIFICATION]",{assignmentId,error:notificationError instanceof Error?notificationError.message:String(notificationError)})}
    await synchronizeConfirmedReservationCalendar({
      client: ctx.client,
      projectId: input.projectId,
      actorId: ctx.user.id,
      onlyExisting: true,
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
    await synchronizeConfirmedReservationCalendar({
      client: ctx.client,
      projectId: input.projectId,
      actorId: ctx.user.id,
      onlyExisting: true,
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
        onlyExisting: true,
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
