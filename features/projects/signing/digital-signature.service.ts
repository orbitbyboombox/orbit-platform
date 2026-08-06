import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCustomerFolderPlan, buildRootFolderPlan } from "@/features/connectors/google-drive";
import { GoogleDriveLive } from "@/features/connectors/google-drive/application/google-drive-live";
import { GoogleDriveApiProvider } from "@/features/connectors/google-drive/provider/google-drive-live.provider";
import { SupabaseGoogleDriveFolderRepository } from "@/features/connectors/google-drive/repository/google-drive-folder.repository";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { createSignedAgreementPdf } from "./signed-agreement-pdf";

const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const tokenHash = (token: string) => sha256(token);
const appOrigin = () => process.env.NEXT_PUBLIC_APP_URL ?? (process.env.GOOGLE_WORKSPACE_REDIRECT_URI ? new URL(process.env.GOOGLE_WORKSPACE_REDIRECT_URI).origin : process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export async function createSigningInvitation(agreementId: string, actorId: string): Promise<{ url: string; expiresAt: string }> {
  const admin = createAdminClient();
  const { data: agreement, error } = await admin.from("agreements").select("id,status,project_id,projects!inner(name,event_date,customer_id,customers!inner(first_name,last_name,email))").eq("id", agreementId).single();
  if (error) throw error; if (agreement.status === "SIGNED") throw new Error("El acuerdo ya está firmado.");
  const project = agreement.projects as unknown as { name: string; event_date: string; customer_id: string; customers: { first_name: string; last_name: string; email: string } };
  if (!project.customers.email) throw new Error("El cliente necesita un correo antes de enviar el acuerdo.");
  await admin.from("agreement_signing_tokens").update({ revoked_at: new Date().toISOString() }).eq("agreement_id", agreementId).is("consumed_at", null).is("revoked_at", null);
  const token = randomBytes(32).toString("base64url"); const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { error: insertError } = await admin.from("agreement_signing_tokens").insert({ agreement_id: agreementId, token_hash: tokenHash(token), expires_at: expiresAt, created_by: actorId });
  if (insertError) throw insertError;
  const url = `${appOrigin()}/sign/${token}`; const accessToken = await loadGoogleWorkspaceAccessToken();
  let draft;
  try { draft = await new GoogleGmailApiProvider(accessToken).createDraft({ to: project.customers.email, subject: `Tu acuerdo BOOMBOX · ${project.name}`, textBody: `Revisa y firma tu acuerdo: ${url}`, htmlBody: `<p>Hola ${escapeHtml(project.customers.first_name)},</p><p>Tu acuerdo BOOMBOX está listo para revisión y firma.</p><p><a href="${url}">Revisar y firmar acuerdo</a></p><p>Este enlace es personal, vence en 7 días y funciona una sola vez.</p>`, driveFileIds: [] }); }
  catch (draftError) { await admin.from("agreement_signing_tokens").update({ revoked_at: new Date().toISOString() }).eq("token_hash", tokenHash(token)); throw draftError; }
  await Promise.all([
    admin.from("communications").insert({ customer_id: project.customer_id, project_id: agreement.project_id, channel: "GMAIL", direction: "OUTBOUND", communication_type: "CONTRACT", thread_key: draft.threadId, subject: `Tu acuerdo BOOMBOX · ${project.name}`, body: "Borrador preparado para confirmación interna.", status: "DRAFT", external_message_id: draft.messageId, created_by: actorId }),
    timeline(admin, { projectId: agreement.project_id, agreementId, action: "AGREEMENT_SENT", message: "Acuerdo preparado y borrador Gmail creado.", actorId }),
  ]);
  return { url, expiresAt };
}

export async function openSigningAgreement(token: string) {
  const admin = createAdminClient(); const hash = tokenHash(token); const now = new Date().toISOString();
  const { data: signing, error } = await admin.from("agreement_signing_tokens").select("id,agreement_id,expires_at,opened_at,consumed_at,revoked_at").eq("token_hash", hash).maybeSingle();
  if (error) throw error; if (!signing || signing.revoked_at || signing.consumed_at || signing.expires_at <= now) return null;
  const { data: agreement, error: agreementError } = await admin.from("agreements").select("id,status,template_version,rendered_contract,project_id,projects!inner(name,event_date,event_time,location,city,customers!inner(full_name,email),project_services(service_code,duration_hours,extras))").eq("id", signing.agreement_id).single();
  if (agreementError) throw agreementError; if (agreement.status === "SIGNED") return null;
  if (!signing.opened_at) { await admin.from("agreement_signing_tokens").update({ opened_at: now }).eq("id", signing.id).is("opened_at", null); await timeline(admin, { projectId: agreement.project_id, agreementId: agreement.id, action: "AGREEMENT_OPENED", message: "El cliente abrió el acuerdo.", actorId: null }); }
  return agreement;
}

export async function confirmDigitalSignature(input: { token: string; signatureDataUrl: string; ipAddress: string; userAgent: string }) {
  const admin = createAdminClient(); const hash = tokenHash(input.token); const now = new Date().toISOString();
  if (!input.signatureDataUrl.startsWith("data:image/png;base64,")) throw new Error("La firma no tiene un formato válido.");
  const signature = Uint8Array.from(Buffer.from(input.signatureDataUrl.slice(input.signatureDataUrl.indexOf(",") + 1), "base64"));
  if (signature.length < 200 || signature.length > 2_000_000) throw new Error("La firma no tiene un tamaño válido.");
  const { data: claim, error: claimError } = await admin.from("agreement_signing_tokens").update({ processing_at: now }).eq("token_hash", hash).gt("expires_at", now).is("consumed_at", null).is("revoked_at", null).is("processing_at", null).select("id,agreement_id").maybeSingle();
  if (claimError) throw claimError; if (!claim) throw new Error("Este enlace ya no está disponible.");
  try {
    const agreement = await openAgreementForSigning(admin, claim.agreement_id); const signedAt = new Date().toISOString(); const customer = agreement.projects.customers; const quotation = agreement.projects.quotations?.[0]; const services = agreement.projects.project_services ?? [];
    const signaturePath = `${agreement.project_id}/${agreement.id}/signature.png`; const { error: signatureError } = await admin.storage.from("orbit-signatures").upload(signaturePath, signature, { contentType: "image/png", upsert: false }); if (signatureError) throw signatureError;
    const pdfBytes = await createSignedAgreementPdf({ quotationNumber: quotation?.quotation_number ?? "Sin cotización", customer: `${customer.first_name} ${customer.last_name}`, event: `${agreement.projects.name} · ${agreement.projects.event_date}`, services: services.map((item) => item.service_name).join(", ") || "Por confirmar", hours: services.map((item) => item.duration_minutes ? `${item.duration_minutes / 60} horas` : "").filter(Boolean).join(", ") || "Por confirmar", extras: services.flatMap((item) => Array.isArray(item.extras) ? item.extras : []).join(", ") || "Sin extras", venue: agreement.projects.location ?? "Por confirmar", address: agreement.projects.city ?? "Por confirmar", signaturePng: signature, signedAt, agreementVersion: agreement.template_version });
    const pdfPath = `${agreement.project_id}/${agreement.id}/agreement-signed.pdf`; const checksum = sha256(pdfBytes); const { error: pdfError } = await admin.storage.from("orbit-documents").upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: false }); if (pdfError) throw pdfError;
    await timeline(admin, { projectId: agreement.project_id, agreementId: agreement.id, action: "PDF_GENERATED", message: "PDF firmado generado correctamente.", actorId: null });
    const accessToken = await loadGoogleWorkspaceAccessToken(); const connection = await loadGoogleWorkspaceConnection(); const plan = buildCustomerFolderPlan(`${customer.first_name} ${customer.last_name}`, agreement.projects.event_date); const drive = new GoogleDriveLive(connection, new GoogleDriveApiProvider(accessToken), new SupabaseGoogleDriveFolderRepository(admin, agreement.project_id)); const rootSync = await drive.synchronizeFolderPlan(buildRootFolderPlan(), signedAt); if (!rootSync.ok) throw new Error(rootSync.error.message); const sync = await drive.synchronizeFolderPlan(plan, signedAt); if (!sync.ok) throw new Error(sync.error.message);
    const contractFolder = sync.folders.find((folder) => folder.path.endsWith("/01 Contrato")); if (!contractFolder?.driveFolderId) throw new Error("No fue posible resolver la carpeta de contrato.");
    const uploaded = await new GoogleDriveApiProvider(accessToken).uploadFile({ name: `Acuerdo firmado - ${agreement.projects.name}.pdf`, mimeType: "application/pdf", bytes: pdfBytes, parentFolderId: contractFolder.driveFolderId });
    const evidenceHash = sha256(`${agreement.id}:${signedAt}:${checksum}:${sha256(signature)}`); const device = deviceInfo(input.userAgent);
    const { error: evidenceError } = await admin.from("agreement_evidence").insert({ agreement_id: agreement.id, signer_name: `${customer.first_name} ${customer.last_name}`, signer_email: customer.email, signature_path: signaturePath, accepted_terms_version: agreement.template_version, agreement_version: agreement.template_version, ip_hash: sha256(input.ipAddress), user_agent: input.userAgent.slice(0, 1000), device_type: device.device, browser_name: device.browser, signed_at: signedAt, evidence_hash: evidenceHash }); if (evidenceError) throw evidenceError;
    const { error: documentError } = await admin.from("documents").insert({ project_id: agreement.project_id, customer_id: agreement.projects.customer_id, document_type: "SIGNED_AGREEMENT", storage_bucket: "orbit-documents", storage_path: pdfPath, checksum, drive_file_id: uploaded.id }); if (documentError) throw documentError;
    const { error: agreementUpdateError } = await admin.from("agreements").update({ status: "SIGNED", signed_pdf_path: pdfPath, drive_file_id: uploaded.id, signed_at: signedAt, locked_at: signedAt, updated_at: signedAt }).eq("id", agreement.id).neq("status", "SIGNED"); if (agreementUpdateError) throw agreementUpdateError;
    await admin.from("agreement_signing_tokens").update({ consumed_at: signedAt, processing_at: null }).eq("id", claim.id);
    await Promise.all([timeline(admin, { projectId: agreement.project_id, agreementId: agreement.id, action: "AGREEMENT_SIGNED", message: "Acuerdo firmado por el cliente.", actorId: null }), timeline(admin, { projectId: agreement.project_id, agreementId: agreement.id, action: "AGREEMENT_LOCKED", message: "Acuerdo bloqueado para edición.", actorId: null }), timeline(admin, { projectId: agreement.project_id, agreementId: agreement.id, action: "PDF_UPLOADED", message: "PDF firmado almacenado en Google Drive.", actorId: null })]);
    return { signedAt };
  } catch (error) { await admin.from("agreement_signing_tokens").update({ processing_at: null }).eq("id", claim.id).is("consumed_at", null); throw error; }
}

async function openAgreementForSigning(admin: ReturnType<typeof createAdminClient>, agreementId: string) {
  const { data, error } = await admin.from("agreements").select("id,status,template_version,project_id,projects!inner(id,name,customer_id,event_date,event_time,location,city,customers!inner(first_name,last_name,email),project_services(service_name,duration_minutes,extras),quotations(quotation_number,status))").eq("id", agreementId).single();
  if (error) throw error; if (data.status === "SIGNED") throw new Error("El acuerdo ya está firmado."); return data as unknown as { id:string; status:string; template_version:string; project_id:string; projects:{ id:string; name:string; customer_id:string; event_date:string; event_time:string; location:string|null; city:string|null; customers:{first_name:string;last_name:string;email:string}; project_services:Array<{service_name:string;duration_minutes:number|null;extras:unknown}>; quotations?:Array<{quotation_number:string;status:string}> } };
}

async function timeline(admin: ReturnType<typeof createAdminClient>, input: { projectId: string; agreementId: string; action: string; message: string; actorId: string | null }) { const correlation = randomUUID(); const { error } = await admin.from("timeline_events").insert({ project_id: input.projectId, agreement_id: input.agreementId, event_type: input.action, title: input.message, description: input.message, orbit_event_id: `ORB-AGREEMENT-${correlation}`, actor_id: input.actorId, actor_label: input.actorId ? "Administrador" : "Cliente", source: input.actorId ? "Administrator" : "Customer", action: input.action, entity_type: "Agreement", entity_id: input.agreementId, human_message: input.message, correlation_id: correlation, created_by: input.actorId }); if (error) throw error; }
function deviceInfo(userAgent: string) { return { device: /iPad|Tablet/i.test(userAgent) ? "TABLET" : /Mobile|Android|iPhone/i.test(userAgent) ? "MOBILE" : "DESKTOP", browser: /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : /Firefox\//.test(userAgent) ? "Firefox" : "Other" }; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }
