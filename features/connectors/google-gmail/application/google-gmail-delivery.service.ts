import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadCompanySettings } from "@/features/company-settings";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleGmailApiProvider } from "../provider/google-gmail-live.provider";
import { renderFounderReservationNotification } from "./reservation-notification.presentation";
import { sendReservationConfirmation } from "./reservation-confirmation.service";

export async function deliverConfirmedReservationEmail(input: { projectId: string; actorId: string; portal?: { url: string; expiresAt: string } }): Promise<{ status: "SENT" | "PENDING"; messageId?: string }> {
  const result = await sendReservationConfirmation({
    projectId: input.projectId,
    actorId: input.actorId,
    requestId: "automatic",
  });
  return result.status === "SENT"
    ? { status: "SENT", messageId: result.providerMessageId ?? undefined }
    : { status: "PENDING" };
}

export async function deliverFounderReservationNotification(input: { projectId: string; actorId: string }): Promise<{ status: "SENT" | "SKIPPED" | "FAILED"; messageId?: string }> {
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin.from("communications").select("id,status,external_message_id").eq("project_id", input.projectId).eq("channel", "GMAIL").eq("communication_type", "INTERNAL_NOTIFICATION").eq("thread_key", `founder-reservation:${input.projectId}`).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if (existingError) throw existingError;
  if (existing?.status === "SENT") return { status: "SKIPPED", messageId: existing.external_message_id ?? undefined };
  const [{ data: project, error: projectError }, { data: calendar }, { count: portalCount }, company, { data: operational }, { data: financial, error: financialError }] = await Promise.all([
    admin.from("projects").select("id,customer_id,orbit_event_id,name,project_type,event_date,operations,customers!inner(full_name,metadata),project_services(service_code,duration_hours),agreements(status),quotations(quotation_number,customer_type)").eq("id", input.projectId).is("deleted_at", null).single(),
    admin.from("calendar_sync").select("external_event_id").eq("project_id", input.projectId).maybeSingle(),
    admin.from("customer_portal_tokens").select("id", { count: "exact", head: true }).eq("project_id", input.projectId).is("revoked_at", null),
    loadCompanySettings(admin),
    admin.from("project_operational_contracts").select("service_start_at,service_end_at").eq("project_id", input.projectId).maybeSingle(),
    admin.from("financial_event_records").select("invoiced_amount,paid_amount,outstanding_balance").eq("project_id", input.projectId).maybeSingle(),
  ]);
  if (projectError) throw projectError;
  if (financialError) throw financialError;
  if (!financial) throw new Error("La reserva no tiene verdad financiera canónica para notificar al Founder.");
  const configuredFounderEmail=typeof company.emailConfiguration.founderNotificationEmail==="string"?company.emailConfiguration.founderNotificationEmail:"";
  const recipient = configuredFounderEmail || company.operationsEmail || company.salesEmail || company.supportEmail;
  if (!recipient) throw new Error("No existe un correo interno configurado para notificar al Founder.");
  const customer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
  const quotation = Array.isArray(project.quotations) ? project.quotations[0] : project.quotations;
  const agreement = Array.isArray(project.agreements) ? project.agreements[0] : project.agreements;
  const operations = project.operations && typeof project.operations === "object" ? project.operations as Record<string, unknown> : {};
  const drive = operations.googleDrive && typeof operations.googleDrive === "object" ? operations.googleDrive as Record<string, unknown> : {};
  const amount = Number(financial.invoiced_amount);
  const paid = Number(financial.paid_amount);
  const balance = Number(financial.outstanding_balance);
  if(![amount,paid,balance].every(Number.isFinite)||amount<0||paid<0||balance<0||Math.abs(amount-paid-balance)>1)throw new Error("La verdad financiera canónica no es consistente para notificar al Founder.");
  const customerType=quotation?.customer_type==="COMPANY"||project.project_type==="Corporate"?"Empresa":"Particular";
  const rendered = renderFounderReservationNotification({
    projectId: project.id,
    projectUrl: appProjectUrl(project.id),
    orbitEventId: project.orbit_event_id,
    quotationNumber: quotation?.quotation_number,
    customer: { fullName: customer?.full_name, metadata: customer?.metadata },
    serviceCodes: (project.project_services ?? []).map((item) => item.service_code),
    serviceDurations: (project.project_services ?? []).map((item) => Number(item.duration_hours ?? 0)),
    serviceStartAt: operational?.service_start_at,
    serviceEndAt: operational?.service_end_at,
    eventDurationHours: Number(operations.durationHours ?? 0) || null,
    eventDate: project.event_date,
    amount,
    paid,
    balance,
    customerType,
    contractStatus: agreement?.status === "SIGNED" ? "SIGNED" : "PENDING",
    integrations: [
      { label: "Cliente", ready: Boolean(customer?.full_name) },
      { label: "Evento", ready: Boolean(project.id && project.orbit_event_id) },
      { label: "Google Calendar", ready: Boolean(calendar?.external_event_id) },
      { label: "Google Drive", ready: Boolean(drive.folderId) },
      { label: "Portal", ready: Boolean(portalCount) },
      { label: "Finanzas", ready: amount > 0 },
      { label: "Dashboard", ready: true },
    ],
    website: company.website,
  });
  const { subject, htmlBody, textBody } = rendered;
  let lastError="";
  for(let attempt=1;attempt<=3;attempt++)try{
    const result = await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({ to: recipient, subject, textBody, htmlBody, driveFileIds: [] });
    const sentAt=new Date().toISOString();
    const record = { customer_id: project.customer_id, project_id: project.id, channel: "GMAIL", direction: "OUTBOUND", communication_type: "INTERNAL_NOTIFICATION", thread_key: `founder-reservation:${project.id}`, subject, body: textBody, status: "SENT", to_recipient:recipient, external_message_id: result.messageId, sent_at:sentAt, occurred_at:sentAt, created_by: input.actorId };
    const communicationWrite = existing?.id ? await admin.from("communications").update(record).eq("id", existing.id) : await admin.from("communications").insert(record);
    const auditWrite=await admin.from("founder_notification_deliveries").upsert({project_id:project.id,customer_id:project.customer_id,recipient,attempt_number:attempt,status:"SENT",provider_response:{messageId:result.messageId,threadId:result.threadId,accepted:true},failure_reason:null,created_by:input.actorId},{onConflict:"project_id,attempt_number"});
    if(communicationWrite.error||auditWrite.error)console.error(JSON.stringify({level:"error",event:"founder_notification.audit_write_failed",projectId:project.id,messageId:result.messageId,error:communicationWrite.error?.message??auditWrite.error?.message,timestamp:new Date().toISOString()}));
    return { status: "SENT", messageId: result.messageId };
  }catch(error){lastError=error instanceof Error?error.message:String(error);await admin.from("founder_notification_deliveries").upsert({project_id:project.id,customer_id:project.customer_id,recipient,attempt_number:attempt,status:"FAILED",provider_response:{provider:"GMAIL",accepted:false},failure_reason:lastError,created_by:input.actorId},{onConflict:"project_id,attempt_number"});console.error(JSON.stringify({level:"error",event:"founder_notification.attempt_failed",projectId:project.id,attempt,recipient,error:lastError,timestamp:new Date().toISOString()}));}
  await admin.from("internal_notifications").upsert({project_id:project.id,customer_id:project.customer_id,notification_type:"FOUNDER_NOTIFICATION_FAILED",title:"Founder Notification Failed",message:`No fue posible notificar la reserva ${quotation?.quotation_number??project.orbit_event_id} después de 3 intentos.`,status:"UNREAD",correlation_id:`founder-notification-failed:${project.id}`,category:"SYSTEM",priority:"CRITICAL",action_required:true,entity_type:"Project",entity_id:project.id,related_href:"/settings#founder-notifications",metadata:{recipient,reason:lastError,attempts:3}},{onConflict:"correlation_id"});
  return{status:"FAILED"};
}

function appProjectUrl(projectId: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl";
  return `${origin}/projects/${projectId}`;
}
