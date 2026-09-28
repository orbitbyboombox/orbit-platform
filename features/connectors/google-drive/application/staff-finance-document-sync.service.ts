import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanySettings } from "@/features/company-settings";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleDriveApiProvider, type GoogleDriveCreatedFolder, type GoogleDriveLiveProvider } from "../provider/google-drive-live.provider";

type SourceKind = "EXPENSE" | "REIMBURSEMENT" | "PAYMENT";
type DocumentLink = { id: string; bucket: string; path: string; fileName: string; mimeType: string; driveFileId: string | null };
type SyncResult = { kind: SourceKind; sourceId: string; status: "SYNCED" | "REQUIRES_REVIEW" | "ERROR"; driveFileId?: string; reason?: string; staff?: string; event?: string; amount?: number };

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const clean = (value: string) => value.trim().replace(/[\\/]+/g, "-").replace(/\s+/g, " ");
const baseName = (path: string) => path.split("/").at(-1) || "comprobante";
const mimeFrom = (name: string, fallback = "application/octet-stream") => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return fallback;
};
const monthParts = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Fecha inválida: ${value}`);
  return { year: String(date.getUTCFullYear()), month: MONTHS[date.getUTCMonth()] };
};

async function resolveRootFolderId(provider: GoogleDriveLiveProvider, configuredRoot: string) {
  const root = configuredRoot.trim();
  if (/^[A-Za-z0-9_-]{20,}$/.test(root)) return root;
  const existing = await provider.findFolder({ name: root });
  if (!existing) throw new Error(`No se encontró la raíz de Google Drive configurada: ${root}`);
  return existing.id;
}

async function folder(provider: GoogleDriveLiveProvider, rootId: string, parts: readonly string[]) {
  let parent: string | undefined = rootId;
  let path = rootId;
  for (const name of parts) {
    path = `${path}/${name}`;
    const existing = await provider.findFolder({ name, parentFolderId: parent });
    const created: GoogleDriveCreatedFolder = existing ?? await provider.createFolder({ name, parentFolderId: parent });
    parent = created.id;
  }
  return { id: parent!, path };
}

async function uploadOnce(provider: GoogleDriveLiveProvider, parentFolderId: string, document: DocumentLink, name: string, bytes: Uint8Array) {
  const existing = await provider.findFileByName({ name, parentFolderId });
  return existing ?? provider.uploadFile({ name, mimeType: document.mimeType || mimeFrom(name), bytes, parentFolderId });
}

async function download(client: SupabaseClient, document: DocumentLink) {
  const { data, error } = await client.storage.from(document.bucket).download(document.path);
  if (error || !data) throw error ?? new Error("Archivo no disponible en Supabase Storage.");
  return new Uint8Array(await data.arrayBuffer());
}

async function readDocument(client: SupabaseClient, table: "documents" | "staff_onboarding_documents", id: string): Promise<DocumentLink | null> {
  const select = table === "documents" ? "id,storage_bucket,storage_path,original_filename,mime_type,drive_file_id" : "id,storage_bucket,storage_path,file_name,mime_type,drive_file_id";
  const { data, error } = await client.from(table).select(select).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data?.storage_path) return null;
  const row = data as Record<string, unknown>;
  return { id, bucket: String(row.storage_bucket || "orbit-documents"), path: String(row.storage_path), fileName: String(row.original_filename || row.file_name || baseName(String(row.storage_path))), mimeType: String(row.mime_type || mimeFrom(String(row.storage_path))), driveFileId: row.drive_file_id ? String(row.drive_file_id) : null };
}

async function markDocument(client: SupabaseClient, table: "documents" | "staff_onboarding_documents", id: string, values: Record<string, unknown>) {
  const { error } = await client.from(table).update(values).eq("id", id);
  if (error) throw error;
}

async function syncDocument(input: { client: SupabaseClient; provider: GoogleDriveLiveProvider; document: DocumentLink; folderId: string; filename: string }) {
  if (input.document.driveFileId) return input.document.driveFileId;
  const bytes = await download(input.client, input.document);
  const file = await uploadOnce(input.provider, input.folderId, input.document, input.filename, bytes);
  return file.id;
}

export async function syncStaffFinanceDocuments(input: { client: SupabaseClient; from?: string; to?: string }) {
  const from = input.from ?? "2026-08-01";
  const to = input.to ?? "2026-10-01";
  const [company, token] = await Promise.all([loadCompanySettings(input.client), loadGoogleWorkspaceAccessToken()]);
  const provider = new GoogleDriveApiProvider(token);
  const rootFolderId = await resolveRootFolderId(provider, company.driveRootFolder);
  const results: SyncResult[] = [];
  const staffCache = new Map<string, string>();
  const projectCache = new Map<string, { name: string; date: string }>();
  const getStaff = async (id: string) => { const cached = staffCache.get(id); if (cached) return cached; const { data, error } = await input.client.from("staff").select("first_name,last_name").eq("id", id).single(); if (error) throw error; const name = clean(`${data.first_name} ${data.last_name}`); staffCache.set(id, name); return name; };
  const getProject = async (id: string) => { const cached = projectCache.get(id); if (cached) return cached; const { data, error } = await input.client.from("projects").select("name,event_date").eq("id", id).single(); if (error) throw error; const value = { name: clean(data.name || "Evento sin nombre"), date: String(data.event_date) }; projectCache.set(id, value); return value; };
  const resolveEventFolder = async (staffId: string, projectId: string, date: string) => {
    const staffName = await getStaff(staffId); const project = await getProject(projectId); const { year, month } = monthParts(date);
    return folder(provider, rootFolderId, ["STAFF", "OPERADORES", staffName, "04_REEMBOLSOS", year, month, `${clean(project.name)} - ${project.date}`]);
  };
  const resolveBaseFolder = async (staffId: string, date: string, leaf: string) => { const staffName = await getStaff(staffId); const { year, month } = monthParts(date); return folder(provider, rootFolderId, ["STAFF", "OPERADORES", staffName, leaf, year, month]); };
  const setStatus = async (table: "documents" | "staff_onboarding_documents", id: string, driveFileId: string | null, driveFolderId: string | null, error?: string) => markDocument(input.client, table, id, { drive_file_id: driveFileId, drive_folder_id: driveFolderId, drive_sync_status: driveFileId ? "SYNCED" : "ERROR", drive_sync_error: error ?? null, drive_synced_at: driveFileId ? new Date().toISOString() : null });

  const { data: expenses, error: expenseError } = await input.client.from("staff_expense_submissions").select("id,staff_id,project_id,amount,occurred_on,receipt_path,document_id").not("receipt_path", "is", null).gte("occurred_on", from).lt("occurred_on", to);
  if (expenseError) throw expenseError;
  for (const item of expenses ?? []) {
    try {
      if (!item.document_id) throw new Error("Gasto sin document_id.");
      const document = await readDocument(input.client, "documents", item.document_id); if (!document) throw new Error("Documento de gasto sin archivo.");
      const staff = await getStaff(item.staff_id); const project = await getProject(item.project_id);
      const destination = await resolveEventFolder(item.staff_id, item.project_id, item.occurred_on);
      const driveId = await syncDocument({ client: input.client, provider, document, folderId: destination.id, filename: `GASTO_ORIGINAL_${Number(item.amount).toFixed(0)}_${baseName(document.fileName)}`, });
      await setStatus("documents", document.id, driveId, destination.id); results.push({ kind: "EXPENSE", sourceId: item.id, status: "SYNCED", driveFileId: driveId, staff, event: project.name, amount: Number(item.amount) });
    } catch (error) { results.push({ kind: "EXPENSE", sourceId: item.id, status: "REQUIRES_REVIEW", reason: error instanceof Error ? error.message : "Error de sincronización" }); }
  }

  const { data: reimbursements, error: reimbursementError } = await input.client.from("staff_reimbursement_payments").select("id,staff_id,project_id,amount,paid_on,receipt_document_id,staff_expense_submission_id").gte("paid_on", from).lt("paid_on", to);
  if (reimbursementError) throw reimbursementError;
  for (const item of reimbursements ?? []) {
    try {
      const expense = (expenses ?? []).find((candidate) => candidate.id === item.staff_expense_submission_id);
      const staff = await getStaff(item.staff_id); const project = await getProject(item.project_id);
      if (item.receipt_document_id) {
        const document = await readDocument(input.client, "staff_onboarding_documents", item.receipt_document_id); if (!document) throw new Error("Comprobante de reembolso sin archivo.");
        const destination = await resolveEventFolder(item.staff_id, item.project_id, item.paid_on);
        const driveId = await syncDocument({ client: input.client, provider, document, folderId: destination.id, filename: `REEMBOLSO_PAGADO_${Number(item.amount).toFixed(0)}_${baseName(document.fileName)}` });
        await setStatus("staff_onboarding_documents", document.id, driveId, destination.id); results.push({ kind: "REIMBURSEMENT", sourceId: item.id, status: "SYNCED", driveFileId: driveId, staff, event: project.name, amount: Number(item.amount) });
      } else { results.push({ kind: "REIMBURSEMENT", sourceId: item.id, status: "REQUIRES_REVIEW", reason: expense ? "Falta comprobante del reembolso pagado." : "Falta gasto asociado y comprobante de reembolso.", staff, event: project.name, amount: Number(item.amount) }); }
    } catch (error) { results.push({ kind: "REIMBURSEMENT", sourceId: item.id, status: "REQUIRES_REVIEW", reason: error instanceof Error ? error.message : "Error de sincronización" }); }
  }

  const { data: movements, error: movementError } = await input.client.from("event_staff_settlement_movements").select("id,settlement_id,amount,movement_date,receipt_path,receipt_document_id,event_staff_payments(staff_id,project_id)").is("deleted_at", null).not("receipt_path", "is", null).gte("movement_date", from).lt("movement_date", to);
  if (movementError) throw movementError;
  for (const item of movements ?? []) {
    try {
      const settlement = Array.isArray(item.event_staff_payments) ? item.event_staff_payments.at(0) : item.event_staff_payments;
      if (!settlement?.staff_id || !settlement.project_id || !item.receipt_path) throw new Error("Comprobante de pago sin vínculo canónico de Staff/evento.");
      const staff = await getStaff(settlement.staff_id); const project = await getProject(settlement.project_id);
      let document: DocumentLink | null = item.receipt_document_id ? await readDocument(input.client, "staff_onboarding_documents", item.receipt_document_id) : null;
      if (!document) {
        const { data: created, error } = await input.client.from("staff_onboarding_documents").insert({ staff_id: settlement.staff_id, document_type: "STAFF_PAYMENT_RECEIPT", category: "PAGOS", applicable_month: item.movement_date.slice(0, 7), friendly_label: "Comprobante de pago Staff", status: "ACTIVE", storage_bucket: "orbit-documents", storage_path: item.receipt_path, file_name: baseName(item.receipt_path), mime_type: mimeFrom(item.receipt_path) }).select("id").single();
        if (error) throw error;
        await input.client.from("event_staff_settlement_movements").update({ receipt_document_id: created.id }).eq("id", item.id);
        document = await readDocument(input.client, "staff_onboarding_documents", created.id);
      }
      if (!document) throw new Error("No fue posible materializar el documento de pago.");
      const destination = await resolveBaseFolder(settlement.staff_id, item.movement_date, "05_COMPROBANTES_PAGO");
      const driveId = await syncDocument({ client: input.client, provider, document, folderId: destination.id, filename: `PAGO_${Number(item.amount).toFixed(0)}_${baseName(document.fileName)}` });
      await setStatus("staff_onboarding_documents", document.id, driveId, destination.id); results.push({ kind: "PAYMENT", sourceId: item.id, status: "SYNCED", driveFileId: driveId, staff, event: project.name, amount: Number(item.amount) });
    } catch (error) { results.push({ kind: "PAYMENT", sourceId: item.id, status: "REQUIRES_REVIEW", reason: error instanceof Error ? error.message : "Error de sincronización" }); }
  }
  return { processed: results.length, synced: results.filter((result) => result.status === "SYNCED").length, requiresReview: results.filter((result) => result.status === "REQUIRES_REVIEW").length, results };
}
