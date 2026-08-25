import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCustomerGallery } from "./customer-gallery.service";
import { loadCustomerDocuments } from "./customer-documents.service";

export const portalTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const origin = () => process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export async function createCustomerPortalAccess(projectId: string, actorId: string, options: { preserveExisting?: boolean } = {}) {
  const admin = createAdminClient();
  const { data: project, error } = await admin.from("projects").select("id,customer_id").eq("id", projectId).is("deleted_at", null).single();
  if (error) throw error;
  if (!options.preserveExisting) await admin.from("customer_portal_tokens").update({ revoked_at: new Date().toISOString(), updated_by: actorId }).eq("project_id", projectId).is("revoked_at", null);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const { error: insertError } = await admin.from("customer_portal_tokens").insert({ project_id: project.id, customer_id: project.customer_id, token_hash: portalTokenHash(token), expires_at: expiresAt, created_by: actorId, updated_by: actorId });
  if (insertError) throw insertError;
  return { url: `${origin()}/p/${token}`, expiresAt };
}

export async function loadCustomerPortal(token: string) {
  const admin = createAdminClient(); const now = new Date().toISOString();
  const { data: access, error } = await admin.from("customer_portal_tokens").select("id,project_id,customer_id,expires_at").eq("token_hash", portalTokenHash(token)).gt("expires_at", now).is("revoked_at", null).maybeSingle();
  if (error || !access) return null;
  await admin.from("customer_portal_tokens").update({ last_accessed_at: now }).eq("id", access.id);
  return loadCustomerPortalProject(access);
}

export async function loadCustomerPortalProject(access: {id:string;project_id:string;customer_id:string;expires_at:string}) {
  const admin = createAdminClient();
  const [project, quotation, agreement, evidence, documents, requests, payments, uploads, contractTimeline, contractFolder, invoice, designTimeline, communications, communicationTimeline] = await Promise.all([
    admin.from("projects").select("id,orbit_event_id,name,project_type,status,event_date,event_time,location,city,finance,operations,customers!inner(full_name,email,phone,metadata),project_services(service_code,duration_hours,extras)").eq("id", access.project_id).single(),
    admin.from("quotations").select("id,status,quotation_number,subtotal,transport_total,discount_total,grand_total,final_customer_price,expiration_date,pdf_storage_path,drive_file_id").eq("project_id", access.project_id).is("deleted_at", null).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    admin.from("agreements").select("id,status,signed_pdf_path,drive_file_id,created_at,updated_at,signed_at").eq("project_id", access.project_id).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    admin.from("agreement_evidence").select("id,signer_name,signature_path,signed_at").eq("agreement_id", (await admin.from("agreements").select("id").eq("project_id",access.project_id).order("created_at",{ascending:false}).limit(1).maybeSingle()).data?.id ?? crypto.randomUUID()).maybeSingle(),
    admin.from("documents").select("id,document_type,drive_file_id,created_at,original_filename,mime_type,version,is_current,workflow_status,approved_at").eq("project_id", access.project_id).or("document_type.neq.PHOTO_STRIP_DESIGN,is_current.eq.true").is("deleted_at", null).order("created_at",{ascending:true}),
    admin.from("customer_portal_requests").select("id,request_type,subject,message,status,created_at").eq("project_id",access.project_id).order("created_at",{ascending:false}),
    admin.from("communications").select("id,subject,status,occurred_at").eq("project_id",access.project_id).eq("communication_type","PAYMENT").order("occurred_at",{ascending:false}),
    admin.from("customer_portal_uploads").select("id,file_name,drive_file_id,created_at").eq("project_id",access.project_id).order("created_at",{ascending:false}),
    admin.from("timeline_events").select("id,action,title,occurred_at").eq("project_id",access.project_id).in("action",["AGREEMENT_SENT","AGREEMENT_SIGNED"]).order("occurred_at",{ascending:true}),
    admin.from("drive_sync").select("external_folder_id,last_synced_at").eq("project_id",access.project_id).like("destination_key","%/01_Contrato").not("external_folder_id","is",null).limit(1).maybeSingle(),
    admin.from("invoices").select("id,status,amount,paid_amount,due_date,payment_term,invoice_payments(id,amount,paid_at,method,reference)").eq("project_id",access.project_id).is("deleted_at",null).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    admin.from("timeline_events").select("id,action,title,description,occurred_at").eq("project_id",access.project_id).in("action",["DESIGN_APPROVED","DESIGN_CHANGES_REQUESTED","DESIGN_UPLOADED","DESIGN_UPDATED","CUSTOMER_DESIGN_UPLOADED"]).order("occurred_at",{ascending:false}),
    admin.from("communications").select("id,communication_type,subject,body,status,external_message_id,occurred_at,created_at").eq("project_id",access.project_id).eq("channel","GMAIL").order("occurred_at",{ascending:false}),
    admin.from("timeline_events").select("id,communication_id,action,title,description,occurred_at").eq("project_id",access.project_id).in("action",["RESERVATION_CREATED","AUTOMATIC_BOOKING_INVITATION_SENT","RESERVATION_COMPLETED","RESERVATION_CONFIRMED","AGREEMENT_SENT","AGREEMENT_SIGNED","PAYMENT_REMINDER_SENT","COLLECTION_EMAIL_SENT","PAYMENT_RECEIVED","DESIGN_SENT","DESIGN_APPROVED","EVENT_REMINDER_SENT","GALLERY_AVAILABLE","THANK_YOU_SENT","RESERVATION_CONFIRMATION_SENT"]).order("occurred_at",{ascending:false}),
  ]);
  const failure = [project,quotation,agreement,evidence,documents,requests,payments,uploads,contractTimeline,contractFolder,invoice,designTimeline,communications,communicationTimeline].find((result)=>result.error);
  if (failure?.error) throw failure.error;
  const finance=project.data?.finance as Record<string,unknown>|null;const operations=project.data?.operations as Record<string,unknown>|null;
  const notes=String(operations?.notes??"");const note=(label:string)=>notes.match(new RegExp(`${label}:\\s*([^\\n]+)`,"i"))?.[1]?.trim();const contactParts=(note("Contacto operacional")??"").split("·").map(value=>value.trim());
  const portalProject={...project.data!,finance:{status:finance?.status,paymentStatus:finance?.paymentStatus,reservationAmount:finance?.reservationAmount,remainingBalance:finance?.remainingBalance,totalPaid:finance?.totalPaid,paymentMethod:finance?.paymentMethod,dueDate:finance?.dueDate},operations:{status:operations?.status,designStatus:operations?.designStatus,designNotes:operations?.designNotes,designApprovedAt:operations?.designApprovedAt,designDocumentId:operations?.designDocumentId,arrivalTime:operations?.arrivalTime,eventAddress:operations?.eventAddress??note("Dirección evento"),operationalContact:operations?.operationalContact??contactParts[0],operationalPhone:operations?.operationalPhone??contactParts[1]}};
  const [gallery, customerDocuments] = await Promise.all([
    loadCustomerGallery(access.project_id),
    loadCustomerDocuments(access.project_id),
  ]);
  return { access, project: portalProject, quotation: quotation.data, agreement: agreement.data, evidence: evidence.data, documents: documents.data ?? [], requests: requests.data ?? [], payments: payments.data ?? [], uploads: uploads.data ?? [], contractTimeline: contractTimeline.data ?? [], contractFolder: contractFolder.data, invoice: invoice.data, designTimeline: designTimeline.data ?? [], communications: communications.data ?? [], communicationTimeline: communicationTimeline.data ?? [], gallery, customerDocuments };
}
