"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortalSession, requestEvidence } from "./portal-auth.service";
import { deliverAssignmentCancellationEmail } from "@/features/operations/staff-assignment-cancellation.service";

const CHECKLIST = new Set([
  "READ_OPERATIONAL_SHEET",
  "EQUIPMENT_CHECKED",
  "VEHICLE_CHECKED",
  "ROUTE_REVIEWED",
  "READY_TO_DEPART",
]);

export async function recordStaffCheckInAction(
  projectId: string,
  status: string,
) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) return { ok: false, message: "Tu sesión expiró." };
  const admin = createAdminClient(),
    evidence = requestEvidence(await headers());
  const { data, error } = await admin.rpc("record_staff_portal_checkin", {
    p_staff_id: session.staff_id,
    p_project_id: projectId,
    p_status: status,
  });
  if (!error && data)
    await admin
      .from("staff_event_checkins")
      .update({
        metadata: {
          device: evidence.device,
          ip_hash: evidence.ipHash,
          user_agent: evidence.userAgent,
        },
      })
      .eq("id", data);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/staff-portal");
  return { ok: true, message: "Estado operacional actualizado." };
}

export async function acceptStaffAssignmentAction(projectId: string) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) return { ok: false, message: "Tu sesión expiró." };
  const admin = createAdminClient(),
    evidence = requestEvidence(await headers()),
    now = new Date().toISOString();
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("customer_id,orbit_event_id")
    .eq("id", projectId)
    .single();
  if (projectError) return { ok: false, message: projectError.message };
  const { data: assignments, error: assignmentError } = await admin
    .from("assignments")
    .update({ status: "CONFIRMED", accepted_at: now })
    .eq("project_id", projectId)
    .eq("staff_id", session.staff_id)
    .in("status", ["PENDING", "PENDING_CONFIRMATION", "ASSIGNED"])
    .is("deleted_at", null)
    .select("id");
  if (assignmentError) return { ok: false, message: assignmentError.message };
  if (!assignments?.length) {
    const { count } = await admin
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("staff_id", session.staff_id)
      .in("status", ["CONFIRMED", "ACCEPTED", "COMPLETED"])
      .is("deleted_at", null);
    if (!count)
      return { ok: false, message: "La asignación ya no está disponible." };
  }
  await admin
    .from("staff_assignment_requests")
    .update({ status: "CONFIRMED", reviewed_at: now })
    .eq("project_id", projectId)
    .eq("staff_id", session.staff_id)
    .eq("status", "APPROVED");
  await admin
    .from("timeline_events")
    .insert({
      customer_id: project.customer_id,
      project_id: projectId,
      staff_id: session.staff_id,
      orbit_event_id: project.orbit_event_id,
      event_type: "STAFF_ACCEPTED",
      title: "Asignación aceptada",
      description: "El colaborador aceptó el paquete operacional.",
      actor_label: "Staff",
      source: "StaffPortal",
      action: "STAFF_ACCEPTED",
      entity_type: "Project",
      entity_id: projectId,
      human_message: "El colaborador aceptó su asignación.",
      correlation_id: `staff-package-accepted:${projectId}:${session.staff_id}`,
      reason: `${evidence.device} · ${evidence.ipHash}`,
    });
  revalidatePath("/staff-portal");
  revalidatePath("/operations");
  revalidatePath(`/projects/${projectId}`);
  return {
    ok: true,
    message: "Asignación aceptada. Tu paquete operacional está listo.",
  };
}

export async function completeStaffChecklistItemAction(
  projectId: string,
  item: string,
) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) return { ok: false, message: "Tu sesión expiró." };
  if (!CHECKLIST.has(item))
    return { ok: false, message: "Control operacional inválido." };
  const admin = createAdminClient(),
    evidence = requestEvidence(await headers());
  const { data: project, error } = await admin
    .from("projects")
    .select("customer_id,orbit_event_id")
    .eq("id", projectId)
    .single();
  if (error) return { ok: false, message: error.message };
  const { count } = await admin
    .from("assignments")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("staff_id", session.staff_id)
    .in("status", ["CONFIRMED", "ACCEPTED"])
    .is("deleted_at", null);
  if (!count) return { ok: false, message: "Acepta primero la asignación." };
  const { error: writeError } = await admin
    .from("timeline_events")
    .insert({
      customer_id: project.customer_id,
      project_id: projectId,
      staff_id: session.staff_id,
      orbit_event_id: project.orbit_event_id,
      event_type: "STAFF_CHECKLIST_ITEM_COMPLETED",
      title: "Checklist operacional actualizado",
      description: item,
      actor_label: "Staff",
      source: "StaffPortal",
      action: "STAFF_CHECKLIST_ITEM_COMPLETED",
      entity_type: "StaffChecklist",
      entity_id: `${projectId}:${session.staff_id}:${item}`,
      human_message: `${item} confirmado por Staff.`,
      correlation_id: `staff-checklist:${projectId}:${session.staff_id}:${item}`,
      reason: `${evidence.device} · ${evidence.ipHash}`,
    });
  if (
    writeError &&
    !String(writeError.message).toLowerCase().includes("duplicate")
  )
    return { ok: false, message: writeError.message };
  revalidatePath("/staff-portal");
  return { ok: true, message: "Checklist actualizado." };
}

export async function requestStaffResponsibilityAction(
  projectId: string,
  responsibility: string,
) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) return { ok: false, message: "Tu sesión expiró." };
  const { error } = await createAdminClient().rpc(
    "request_staff_responsibility",
    {
      p_staff_id: session.staff_id,
      p_project_id: projectId,
      p_responsibility: responsibility,
    },
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath("/staff-portal");
  return { ok: true, message: "Solicitud enviada al Founder." };
}

export async function cancelStaffAssignmentAction(form: FormData) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) return { ok: false, message: "Tu sesión expiró." };
  const projectId = String(form.get("projectId") ?? ""),
    responsibility = String(form.get("responsibility") ?? ""),
    reasonCategory = String(form.get("reasonCategory") ?? ""),
    reasonDetail = String(form.get("reasonDetail") ?? "").trim();
  if (!projectId || !responsibility || !reasonCategory)
    return {
      ok: false,
      message: "Selecciona la asignación y el motivo de cancelación.",
    };
  const admin = createAdminClient(),
    { data: cancellationId, error } = await admin.rpc(
      "cancel_staff_assignment_from_portal",
      {
        p_staff_id: session.staff_id,
        p_project_id: projectId,
        p_responsibility: responsibility,
        p_reason_category: reasonCategory,
        p_reason_detail: reasonDetail,
      },
    );
  if (error || !cancellationId)
    return {
      ok: false,
      message: error?.message ?? "No fue posible cancelar la asignación.",
    };
  const delivery = await deliverAssignmentCancellationEmail(
    admin,
    String(cancellationId),
  );
  revalidatePath("/staff-portal");
  revalidatePath("/");
  revalidatePath("/operations");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/resources/staff");
  return {
    ok: true,
    message:
      delivery.status === "SENT"
        ? "Asignación cancelada. El Founder fue notificado inmediatamente."
        : "Asignación cancelada y alerta crítica creada. El correo al Founder requiere revisión.",
  };
}

export async function changeStaffPasswordAction(form: FormData) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) return { ok: false, message: "Tu sesión expiró." };
  const password = String(form.get("password") ?? ""),
    confirmation = String(form.get("confirmation") ?? "");
  if (password !== confirmation)
    return { ok: false, message: "Las contraseñas no coinciden." };
  const { error } = await createAdminClient().rpc(
    "change_staff_portal_password",
    { p_staff_id: session.staff_id, p_password: password },
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath("/staff-portal");
  return { ok: true, message: "Contraseña creada correctamente." };
}
