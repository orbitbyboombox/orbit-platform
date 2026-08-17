import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoogleDriveLiveProvider } from "../provider/google-drive-live.provider.ts";
import { resolveAutomaticDestination } from "./google-drive-folder-strategy.ts";

export type HistoricalPaymentReceiptDriveSyncStatus =
  | "UPLOADED"
  | "SKIPPED_ALREADY_LINKED"
  | "RECONCILED_EXISTING"
  | "FAILED"
  | "REQUIRES_REVIEW";

export interface HistoricalPaymentReceiptCandidate {
  documentId: string;
  paymentId: string | null;
  invoiceId: string | null;
  projectId: string;
  customerId: string | null;
  customerName: string | null;
  eventDate: string | null;
  storageBucket: string;
  storagePath: string;
  driveFileId: string | null;
  receiptName: string | null;
}

export interface HistoricalPaymentReceiptCandidateResult {
  documentId: string;
  projectId: string;
  paymentId: string | null;
  invoiceId: string | null;
  storageBucket: string;
  storagePath: string;
  filename: string;
  status: HistoricalPaymentReceiptDriveSyncStatus;
  folderPath: string | null;
  driveFileId: string | null;
  attemptedDriveFileId?: string;
  reason?: string;
}

export interface HistoricalPaymentReceiptSyncRunResult {
  processed: number;
  inserted: number;
  reconciled: number;
  skippedAlreadyLinked: number;
  requiresReview: number;
  failed: number;
  results: readonly HistoricalPaymentReceiptCandidateResult[];
}

export interface HistoricalPaymentReceiptSyncRepository {
  loadCandidates(input?: { documentIds?: readonly string[] } | undefined): Promise<HistoricalPaymentReceiptCandidate[]>;
  setDriveFileId(documentId: string, driveFileId: string): Promise<void>;
  downloadReceipt(storageBucket: string, storagePath: string): Promise<{ bytes: Uint8Array; mimeType: string | null }>;
}

export interface ResolutionContext {
  client: SupabaseClient;
  projectId: string;
  customerName: string;
  eventDate: string;
  kind: "PAYMENT_PROOF";
}

export interface PilotDriveFolderInput {
  customerName: string;
  eventDate: string;
  rootDriveFolder: string;
}

type CustomerProfile = { full_name?: unknown; id?: unknown };
type CustomerProfileRow = CustomerProfile | readonly CustomerProfile[] | null | undefined;

export type HistoricalPaymentReceiptCandidateRow = {
  id: string;
  invoice_id: string | null;
  payment_id: string | null;
  project_id: string;
  customer_id: string | null;
  drive_file_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  projects?:
    | {
        event_date: string | null;
        customer_id?: unknown;
        customers?: CustomerProfileRow;
      }
    | readonly {
        event_date: string | null;
        customer_id?: unknown;
        customers?: CustomerProfileRow;
      }[]
    | null;
  customers?: CustomerProfileRow;
  invoice_payments?:
    | { receipt_name: string | null }
    | readonly { receipt_name: string | null }[]
    | null;
};

function extractReason(error: unknown): string {
  return error instanceof Error ? error.message : "No fue posible completar la operación.";
}

function resolveProfileName(profile: CustomerProfileRow): string | null {
  const selected = Array.isArray(profile) ? profile.at(0) : profile;
  if (!selected || typeof selected !== "object") return null;
  return trimOrNull(selected.full_name);
}

export function resolveCanonicalCustomerName(row: HistoricalPaymentReceiptCandidateRow): string | null {
  const project = Array.isArray(row.projects) ? row.projects.at(0) : row.projects;
  const fromProject = project ? resolveProfileName(project.customers) : null;
  if (fromProject) return fromProject;
  return resolveProfileName(row.customers);
}

export function resolveCanonicalPilotFolderPath(input: PilotDriveFolderInput): string {
  return resolveAutomaticDestination(
    {
      kind: "PAYMENT_PROOF",
      context: {
        customerName: input.customerName,
        eventDate: input.eventDate,
      },
    },
    input.rootDriveFolder,
  ).folderPath;
}

const PILOT_EXTENSIONS = [".png", ".jpg", ".jpeg"];

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function resolveReceiptName(input: HistoricalPaymentReceiptCandidate): string {
  return trimOrNull(input.receiptName) ?? resolvePathBaseName(input.storagePath);
}

function resolvePathBaseName(value: string): string {
  const path = value.trim();
  const parts = path.split("/");
  const base = parts.at(-1) ?? "receipt";
  return base.length > 0 ? base : `receipt-${Date.now()}`;
}

function resolveFilenameForUpload(input: HistoricalPaymentReceiptCandidate, storageMimeType: string | null): string {
  const name = resolveReceiptName(input);
  const lower = name.toLowerCase();
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".pdf")) {
    return name;
  }
  const suffix = storageMimeType === "image/png"
    ? ".png"
    : storageMimeType === "image/jpeg"
      ? ".jpg"
      : storageMimeType === "application/pdf"
        ? ".pdf"
        : ".bin";
  return `${name}${suffix}`;
}

function resolveMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function isStoragePathPresent(input: HistoricalPaymentReceiptCandidate): boolean {
  return Boolean(trimOrNull(input.storageBucket)) && Boolean(trimOrNull(input.storagePath));
}

export function hasPilotContext(input: HistoricalPaymentReceiptCandidate): boolean {
  const name = resolveReceiptName(input).toLowerCase();
  const isPngOrJpg = PILOT_EXTENSIONS.some((ext) => name.endsWith(ext));
  return isPngOrJpg
    && Boolean(trimOrNull(input.customerName))
    && Boolean(trimOrNull(input.eventDate))
    && isStoragePathPresent(input);
}

export class DefaultHistoricalPaymentReceiptDriveSyncRepository implements HistoricalPaymentReceiptSyncRepository {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async loadCandidates(input?: { documentIds?: readonly string[] } | undefined): Promise<HistoricalPaymentReceiptCandidate[]> {
type LoadCandidatesRow = {
      id: string;
      invoice_id: string | null;
      payment_id: string | null;
      project_id: string;
      customer_id: string | null;
      drive_file_id: string | null;
      storage_bucket: string | null;
      storage_path: string | null;
    projects?: Array<{
        event_date: string | null;
        customer_id?: unknown;
        customers?: { id: string; full_name: string } | Array<{ id: string; full_name: string }> | null;
      }> | { event_date: string | null; customer_id?: unknown; customers?: { id: string; full_name: string } | Array<{ id: string; full_name: string }> | null } | null;
    invoice_payments?: Array<{ receipt_name: string | null }> | { receipt_name: string | null } | null;
  };

    let query = this.client
      .from("documents")
      .select(
        "id,invoice_id,payment_id,project_id,customer_id,drive_file_id,storage_bucket,storage_path,projects(event_date,customer_id,customers(id,full_name)),customers(full_name),invoice_payments(receipt_name)",
      )
      .eq("document_type", "PAYMENT_RECEIPT")
      .is("deleted_at", null)
      .is("drive_file_id", null)
      .order("created_at", { ascending: true });

    if (input?.documentIds?.length) {
      query = query.in("id", [...input.documentIds]);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((row: LoadCandidatesRow) => {
      const project = Array.isArray(row.projects) ? row.projects.at(0) : row.projects;
      const customerName = resolveCanonicalCustomerName(row);
      const invoicePayment = row.invoice_payments;
      const invoicePaymentReceiptName = Array.isArray(invoicePayment)
        ? trimOrNull(invoicePayment.at(0)?.receipt_name)
        : trimOrNull(invoicePayment?.receipt_name);

      const storageBucket = trimOrNull(row.storage_bucket) ?? "orbit-documents";
      const storagePath = trimOrNull(row.storage_path) ?? "";

      return {
        documentId: row.id,
        paymentId: trimOrNull(row.payment_id),
        invoiceId: trimOrNull(row.invoice_id),
        projectId: row.project_id,
        customerId: trimOrNull(row.customer_id) ?? trimOrNull(project?.customer_id) ?? null,
        customerName,
        eventDate: trimOrNull(project?.event_date),
        storageBucket,
        storagePath,
        driveFileId: trimOrNull(row.drive_file_id),
        receiptName: invoicePaymentReceiptName,
      } satisfies HistoricalPaymentReceiptCandidate;
    });
  }

  async setDriveFileId(documentId: string, driveFileId: string): Promise<void> {
    const { error } = await this.client
      .from("documents")
      .update({ drive_file_id: driveFileId })
      .eq("id", documentId)
      .is("drive_file_id", null);
    if (error) throw error;
  }

  async downloadReceipt(storageBucket: string, storagePath: string): Promise<{ bytes: Uint8Array; mimeType: string | null }> {
    const { data, error } = await this.client.storage.from(storageBucket).download(storagePath);
    if (error || !data) {
      throw error ?? new Error("No fue posible leer el archivo desde Storage.");
    }

    return { bytes: new Uint8Array(await data.arrayBuffer()), mimeType: data.type || null };
  }
}

export async function loadHistoricalPaymentReceiptPilotCandidates(client: SupabaseClient): Promise<readonly HistoricalPaymentReceiptCandidate[]> {
  const repository = new DefaultHistoricalPaymentReceiptDriveSyncRepository(client);
  const candidates = await repository.loadCandidates();
  return candidates.filter(hasPilotContext);
}

async function resolveDriveDestination(
  context: ResolutionContext,
): Promise<{ folderId: string; folderPath: string; provider: GoogleDriveLiveProvider }> {
  const { resolveReservationDocumentFolder } = await import("./google-drive-document-routing.service.ts");
  const resolved = await resolveReservationDocumentFolder(context);
  return { folderId: resolved.folderId, folderPath: resolved.folderPath, provider: resolved.provider as GoogleDriveLiveProvider };
}

export async function executeHistoricalPaymentReceiptDriveSync(input: {
  client: SupabaseClient;
  documentIds?: readonly string[];
  resolveDestination?: (context: ResolutionContext) => Promise<{ folderId: string; folderPath: string; provider: GoogleDriveLiveProvider }>;
  repository?: HistoricalPaymentReceiptSyncRepository;
}): Promise<HistoricalPaymentReceiptSyncRunResult> {
  const repository = input.repository ?? new DefaultHistoricalPaymentReceiptDriveSyncRepository(input.client);
  const resolveDestination = input.resolveDestination ?? resolveDriveDestination;
  const candidates = await repository.loadCandidates(input.documentIds ? { documentIds: input.documentIds } : undefined);

  let inserted = 0;
  let reconciled = 0;
  let skippedAlreadyLinked = 0;
  let requiresReview = 0;
  let failed = 0;
  const results: HistoricalPaymentReceiptCandidateResult[] = [];

  for (const candidate of candidates) {
    if (candidate.driveFileId) {
      skippedAlreadyLinked += 1;
      results.push({
        documentId: candidate.documentId,
        projectId: candidate.projectId,
        paymentId: candidate.paymentId,
        invoiceId: candidate.invoiceId,
        storageBucket: candidate.storageBucket,
        storagePath: candidate.storagePath,
        filename: resolveReceiptName(candidate),
        status: "SKIPPED_ALREADY_LINKED",
        folderPath: null,
        driveFileId: candidate.driveFileId,
      });
      continue;
    }

    if (!isStoragePathPresent(candidate)) {
      requiresReview += 1;
      results.push({
        documentId: candidate.documentId,
        projectId: candidate.projectId,
        paymentId: candidate.paymentId,
        invoiceId: candidate.invoiceId,
        storageBucket: candidate.storageBucket,
        storagePath: candidate.storagePath,
        filename: resolveReceiptName(candidate),
        status: "REQUIRES_REVIEW",
        folderPath: null,
        driveFileId: null,
        reason: "Documento sin ruta de Storage válida.",
      });
      continue;
    }

    if (!candidate.customerName || !candidate.eventDate) {
      requiresReview += 1;
      results.push({
        documentId: candidate.documentId,
        projectId: candidate.projectId,
        paymentId: candidate.paymentId,
        invoiceId: candidate.invoiceId,
        storageBucket: candidate.storageBucket,
        storagePath: candidate.storagePath,
        filename: resolveReceiptName(candidate),
        status: "REQUIRES_REVIEW",
        folderPath: null,
        driveFileId: null,
        reason: "No fue posible resolver cliente y fecha del evento.",
      });
      continue;
    }

    let file: { bytes: Uint8Array; mimeType: string | null };
    try {
      file = await repository.downloadReceipt(candidate.storageBucket, candidate.storagePath);
    } catch (error) {
      requiresReview += 1;
      results.push({
        documentId: candidate.documentId,
        projectId: candidate.projectId,
        paymentId: candidate.paymentId,
        invoiceId: candidate.invoiceId,
        storageBucket: candidate.storageBucket,
        storagePath: candidate.storagePath,
        filename: resolveReceiptName(candidate),
        status: "REQUIRES_REVIEW",
        folderPath: null,
        driveFileId: null,
        reason: extractReason(error),
      });
      continue;
    }

    let destination: { folderId: string; folderPath: string; provider: GoogleDriveLiveProvider };
    try {
      destination = await resolveDestination({
        client: input.client,
        projectId: candidate.projectId,
        customerName: candidate.customerName,
        eventDate: candidate.eventDate,
        kind: "PAYMENT_PROOF",
      });
    } catch (error) {
      failed += 1;
      results.push({
        documentId: candidate.documentId,
        projectId: candidate.projectId,
        paymentId: candidate.paymentId,
        invoiceId: candidate.invoiceId,
        storageBucket: candidate.storageBucket,
        storagePath: candidate.storagePath,
        filename: resolveReceiptName(candidate),
        status: "FAILED",
        folderPath: null,
        driveFileId: null,
        reason: extractReason(error),
      });
      continue;
    }

    const filename = resolveFilenameForUpload(candidate, file.mimeType);
    const provider = destination.provider;

    let existing: { id: string; name: string } | null;
    try {
      existing = await provider.findFileByName({
        name: filename,
        parentFolderId: destination.folderId,
      });
    } catch (error) {
      failed += 1;
      results.push({
        documentId: candidate.documentId,
        projectId: candidate.projectId,
        paymentId: candidate.paymentId,
        invoiceId: candidate.invoiceId,
        storageBucket: candidate.storageBucket,
        storagePath: candidate.storagePath,
        filename,
        status: "FAILED",
        folderPath: destination.folderPath,
        driveFileId: null,
        reason: extractReason(error),
      });
      continue;
    }

    if (existing) {
      try {
        await repository.setDriveFileId(candidate.documentId, existing.id);
        reconciled += 1;
        results.push({
          documentId: candidate.documentId,
          projectId: candidate.projectId,
          paymentId: candidate.paymentId,
          invoiceId: candidate.invoiceId,
          storageBucket: candidate.storageBucket,
          storagePath: candidate.storagePath,
          filename,
          status: "RECONCILED_EXISTING",
          folderPath: destination.folderPath,
          driveFileId: existing.id,
        });
      } catch (error) {
        failed += 1;
        results.push({
          documentId: candidate.documentId,
          projectId: candidate.projectId,
          paymentId: candidate.paymentId,
          invoiceId: candidate.invoiceId,
          storageBucket: candidate.storageBucket,
          storagePath: candidate.storagePath,
          filename,
          status: "FAILED",
          folderPath: destination.folderPath,
          driveFileId: null,
          attemptedDriveFileId: existing.id,
          reason: extractReason(error),
        });
      }
      continue;
    }

    try {
      const uploaded = await provider.uploadFile({
        name: filename,
        mimeType: file.mimeType ?? resolveMime(filename),
        bytes: file.bytes,
        parentFolderId: destination.folderId,
      });

      await repository.setDriveFileId(candidate.documentId, uploaded.id);
      inserted += 1;
      results.push({
        documentId: candidate.documentId,
        projectId: candidate.projectId,
        paymentId: candidate.paymentId,
        invoiceId: candidate.invoiceId,
        storageBucket: candidate.storageBucket,
        storagePath: candidate.storagePath,
        filename,
        status: "UPLOADED",
        folderPath: destination.folderPath,
        driveFileId: uploaded.id,
      });
    } catch (error) {
      failed += 1;
      let reconciledCandidate: { id: string; name: string } | null = null;
      try {
        reconciledCandidate = await provider.findFileByName({
          name: filename,
          parentFolderId: destination.folderId,
        });
      } catch {
        reconciledCandidate = null;
      }

      results.push({
        documentId: candidate.documentId,
        projectId: candidate.projectId,
        paymentId: candidate.paymentId,
        invoiceId: candidate.invoiceId,
        storageBucket: candidate.storageBucket,
        storagePath: candidate.storagePath,
        filename,
        status: "FAILED",
        folderPath: destination.folderPath,
        driveFileId: null,
        attemptedDriveFileId: reconciledCandidate?.id,
        reason: extractReason(error),
      });
    }
  }

  return {
    processed: candidates.length,
    inserted,
    reconciled,
    skippedAlreadyLinked,
    requiresReview,
    failed,
    results,
  };
}
