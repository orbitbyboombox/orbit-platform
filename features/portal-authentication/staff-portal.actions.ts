"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPortalSession, requestEvidence } from "./portal-auth.service";
import { deliverAssignmentCancellationBoundary } from "@/features/operations/staff-assignment-cancellation.service";
import {notifyOperationsOfStaffRejection} from "@/features/operations/staff-assignment-notification.service";

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

export async function updateStaffLogisticsTripAction(tripId:string,status:string){
  const session=await loadPortalSession("STAFF");
  if(!session?.staff_id)return{ok:false,message:"Tu sesión expiró."};
  if(!["IN_PROGRESS","ARRIVED","COMPLETED"].includes(status))return{ok:false,message:"Estado de viaje inválido."};
  const admin=createAdminClient(),evidence=requestEvidence(await headers());
  const{data:projectId,error}=await admin.rpc("update_staff_vehicle_trip_status",{p_staff_id:session.staff_id,p_trip_id:tripId,p_status:status,p_odometer:null});
  if(error||!projectId)return{ok:false,message:error?.message??"No fue posible actualizar el viaje."};
  try{const{data:project}=await admin.from("projects").select("customer_id,orbit_event_id").eq("id",projectId).single();if(project)await admin.from("timeline_events").upsert({customer_id:project.customer_id,project_id:projectId,staff_id:session.staff_id,orbit_event_id:project.orbit_event_id,event_type:`LOGISTICS_TRIP_${status}`,title:"Viaje logístico actualizado",description:`El conductor marcó el viaje como ${status}.`,actor_label:"Staff",source:"Staff",action:`LOGISTICS_TRIP_${status}`,entity_type:"VehicleTrip",entity_id:tripId,human_message:`Estado logístico ${status}.`,correlation_id:`staff-logistics-trip:${tripId}:${status}`,reason:`${evidence.device} · ${evidence.ipHash}`},{onConflict:"correlation_id",ignoreDuplicates:true});}catch(boundaryError){console.error("[ORBIT][STAFF_LOGISTICS_TIMELINE_BOUNDARY]",{tripId,status,error:boundaryError instanceof Error?boundaryError.message:String(boundaryError)});}
  revalidatePath("/staff-portal");revalidatePath("/operations");revalidatePath(`/projects/${projectId}`);
  return{ok:true,message:"Viaje logístico actualizado."};
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
    .upsert({
      customer_id: project.customer_id,
      project_id: projectId,
      staff_id: session.staff_id,
      orbit_event_id: project.orbit_event_id,
      event_type: "STAFF_ACCEPTED",
      title: "Asignación aceptada",
      description: "El colaborador aceptó el paquete operacional.",
      actor_label: "Staff",
      source: "Staff",
      action: "STAFF_ACCEPTED",
      entity_type: "Project",
      entity_id: projectId,
      human_message: "El colaborador aceptó su asignación.",
      correlation_id: `staff-package-accepted:${projectId}:${session.staff_id}`,
      reason: `${evidence.device} · ${evidence.ipHash}`,
    },{onConflict:"correlation_id",ignoreDuplicates:true});
  revalidatePath("/staff-portal");
  revalidatePath("/operations");
  revalidatePath(`/projects/${projectId}`);
  return {
    ok: true,
    message: "Asignación aceptada. Tu paquete operacional está listo.",
  };
}

export async function rejectAssignedStaffAssignmentAction(form:FormData){
  const session=await loadPortalSession("STAFF");if(!session?.staff_id)return{ok:false,message:"Tu sesión expiró."};
  const projectId=String(form.get("projectId")??""),reason=String(form.get("reason")??"").trim(),detail=String(form.get("detail")??"").trim();if(!projectId||!reason||!detail)return{ok:false,message:"Selecciona y describe el motivo del rechazo."};
  const admin=createAdminClient(),evidence=requestEvidence(await headers()),now=new Date().toISOString();
  const{data:project,error:projectError}=await admin.from("projects").select("customer_id,orbit_event_id").eq("id",projectId).single();if(projectError||!project)return{ok:false,message:projectError?.message??"Evento no encontrado."};
  const{data:rows,error}=await admin.from("assignments").update({status:"REJECTED",rejected_at:now,response_at:now,reason:`${reason}: ${detail}`}).eq("project_id",projectId).eq("staff_id",session.staff_id).in("status",["PENDING","PENDING_CONFIRMATION","ASSIGNED"]).is("deleted_at",null).select("id");if(error)return{ok:false,message:error.message};if(!rows?.length)return{ok:false,message:"La asignación ya no está disponible."};
  for(const row of rows)await admin.from("timeline_events").upsert({customer_id:project.customer_id,project_id:projectId,staff_id:session.staff_id,orbit_event_id:project.orbit_event_id,event_type:"STAFF_REJECTED",title:"Asignación rechazada",description:`Motivo: ${reason} · ${detail}`,actor_label:"Staff",source:"StaffPortal",action:"STAFF_REJECTED",entity_type:"Assignment",entity_id:row.id,human_message:"El colaborador rechazó su asignación.",correlation_id:`staff-assignment-rejected:${row.id}`,reason:`${reason} · ${detail} · ${evidence.device} · ${evidence.ipHash}`},{onConflict:"correlation_id",ignoreDuplicates:true});
  await notifyOperationsOfStaffRejection(admin,{projectId,staffId:session.staff_id,assignmentIds:rows.map(row=>row.id),reason:`${reason} · ${detail}`});
  revalidatePath("/staff-portal");revalidatePath("/operations");revalidatePath("/notifications");revalidatePath(`/projects/${projectId}`);return{ok:true,message:"Asignación rechazada. Operaciones fue notificado."};
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
      source: "Staff",
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

export async function declineStaffResponsibilityAction(form: FormData) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) return { ok: false, message: "Tu sesión expiró." };
  const projectId = String(form.get("projectId") ?? ""),
    responsibility = String(form.get("responsibility") ?? ""),
    reason = String(form.get("reason") ?? ""),
    detail = String(form.get("detail") ?? "").trim();
  if (!projectId || !responsibility || !reason)
    return { ok: false, message: "Selecciona responsabilidad y motivo." };
  if (reason === "OTHER" && !detail)
    return { ok: false, message: "Describe el motivo del rechazo." };
  const { error } = await createAdminClient().rpc(
    "decline_staff_responsibility",
    {
      p_staff_id: session.staff_id,
      p_project_id: projectId,
      p_responsibility: responsibility,
      p_reason: reason,
      p_detail: detail,
    },
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath("/staff-portal");
  revalidatePath("/operations");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  return {
    ok: true,
    message: "Evento rechazado. El Founder fue notificado inmediatamente.",
  };
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
    evidence = requestEvidence(await headers()),
    { data: cancellationId, error } = await admin.rpc(
      "cancel_staff_assignment_from_portal",
      {
        p_staff_id: session.staff_id,
        p_project_id: projectId,
        p_responsibility: responsibility,
        p_reason_category: reasonCategory,
        p_reason_detail: reasonDetail,
        p_device: evidence.device,
        p_ip_hash: evidence.ipHash,
        p_user_agent: evidence.userAgent,
      },
    );
  if (error || !cancellationId)
    return {
      ok: false,
      message: error?.message ?? "No fue posible cancelar la asignación.",
    };
  let boundaryComplete = false;
  try {
    const boundary = await deliverAssignmentCancellationBoundary(
      admin,
      String(cancellationId),
    );
    boundaryComplete = boundary.failed.length === 0;
  } catch (boundaryError) {
    console.error("[ORBIT][STAFF_CANCELLATION_BOUNDARY]", {
      cancellationId,
      stage: "load",
      error:
        boundaryError instanceof Error
          ? boundaryError.message
          : String(boundaryError),
    });
  }
  revalidatePath("/staff-portal");
  revalidatePath("/");
  revalidatePath("/operations");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/resources/staff");
  return {
    ok: true,
    message:
      boundaryComplete
        ? "Asignación cancelada. El Founder fue notificado inmediatamente."
        : "Asignación cancelada correctamente. Una entrega secundaria quedó registrada para revisión.",
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

export async function submitStaffExpenseAction(form: FormData) {
  const session = await loadPortalSession("STAFF");
  if (!session?.staff_id) return { ok: false, message: "Tu sesión expiró." };
  const projectId = String(form.get("projectId") ?? ""),
    category = String(form.get("category") ?? ""),
    amount = Number(form.get("amount") ?? 0),
    occurredOn = String(form.get("occurredOn") ?? ""),
    description = String(form.get("description") ?? "").trim(),
    file = form.get("receipt");
  if (!(file instanceof File) || !file.size)
    return { ok: false, message: "Adjunta una foto o PDF del comprobante." };
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type))
    return { ok: false, message: "El comprobante debe ser una foto o PDF." };
  if (file.size > 15 * 1024 * 1024)
    return { ok: false, message: "El comprobante no puede superar 15 MB." };
  const admin = createAdminClient(), bytes = await file.arrayBuffer(),
    checksum = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("hex"),
    idempotencyKey = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode([session.staff_id, projectId, category, amount, occurredOn, checksum].join("|")))).toString("hex"),
    extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin",
    path = `staff-expenses/${session.staff_id}/${projectId}/${idempotencyKey}.${extension}`;
  const upload = await admin.storage.from("orbit-expenses").upload(path, bytes, { contentType: file.type, upsert: false });
  if (upload.error && !upload.error.message.toLowerCase().includes("already exists")) return { ok: false, message: upload.error.message };
  const { error } = await admin.rpc("create_staff_expense_submission", { p_staff_id: session.staff_id, p_project_id: projectId, p_category: category, p_amount: amount, p_occurred_on: occurredOn, p_payment_method: String(form.get("paymentMethod") ?? ""), p_description: description, p_notes: String(form.get("notes") ?? ""), p_receipt_path: path, p_checksum: checksum, p_idempotency_key: idempotencyKey, p_reimbursement: String(form.get("expenseOwner") ?? "REIMBURSEMENT") === "REIMBURSEMENT" });
  if (error) { if (!upload.error) await admin.storage.from("orbit-expenses").remove([path]); return { ok: false, message: error.message }; }
  revalidatePath("/staff-portal"); revalidatePath(`/projects/${projectId}/staff-expenses`); revalidatePath("/operations");
  return { ok: true, message: "Gasto enviado. El Founder debe revisarlo antes de que impacte finanzas." };
}
