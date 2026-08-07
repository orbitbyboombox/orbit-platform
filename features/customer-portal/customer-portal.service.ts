import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const portalTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const origin = () => process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export async function createCustomerPortalAccess(projectId: string, actorId: string) {
  const admin = createAdminClient();
  const { data: project, error } = await admin.from("projects").select("id,customer_id").eq("id", projectId).is("deleted_at", null).single();
  if (error) throw error;
  await admin.from("customer_portal_tokens").update({ revoked_at: new Date().toISOString(), updated_by: actorId }).eq("project_id", projectId).is("revoked_at", null);
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
  const [project, services, quotation, agreement, evidence, documents, timeline, calendar, requests, payments, uploads] = await Promise.all([
    admin.from("projects").select("id,orbit_event_id,name,project_type,status,event_date,event_time,location,city,finance,operations,customers!inner(full_name,email,phone)").eq("id", access.project_id).single(),
    admin.from("project_services").select("service_code,duration_hours,extras").eq("project_id", access.project_id),
    admin.from("quotations").select("id,status,quotation_number,grand_total,final_customer_price,expiration_date,pdf_storage_path,drive_file_id").eq("project_id", access.project_id).is("deleted_at", null).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    admin.from("agreements").select("id,status,signed_pdf_path,drive_file_id").eq("project_id", access.project_id).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    admin.from("agreement_evidence").select("id,signed_at").eq("agreement_id", (await admin.from("agreements").select("id").eq("project_id",access.project_id).order("created_at",{ascending:false}).limit(1).maybeSingle()).data?.id ?? crypto.randomUUID()).maybeSingle(),
    admin.from("documents").select("id,document_type,drive_file_id,created_at").eq("project_id", access.project_id).is("deleted_at", null),
    admin.from("timeline_events").select("id,human_message,occurred_at,source").eq("project_id",access.project_id).order("occurred_at",{ascending:false}).limit(12),
    admin.from("calendar_sync").select("status,external_url,last_synced_at").eq("project_id",access.project_id).maybeSingle(),
    admin.from("customer_portal_requests").select("id,request_type,subject,message,status,created_at").eq("project_id",access.project_id).order("created_at",{ascending:false}),
    admin.from("communications").select("id,subject,status,occurred_at").eq("project_id",access.project_id).eq("communication_type","PAYMENT").order("occurred_at",{ascending:false}),
    admin.from("customer_portal_uploads").select("id,file_name,drive_file_id,created_at").eq("project_id",access.project_id).order("created_at",{ascending:false}),
  ]);
  const failure = [project,services,quotation,agreement,evidence,documents,timeline,calendar,requests,payments,uploads].find((result)=>result.error);
  if (failure?.error) throw failure.error;
  return { access, project: project.data!, services: services.data ?? [], quotation: quotation.data, agreement: agreement.data, evidence: evidence.data, documents: documents.data ?? [], timeline: timeline.data ?? [], calendar: calendar.data, requests: requests.data ?? [], payments: payments.data ?? [], uploads: uploads.data ?? [] };
}
