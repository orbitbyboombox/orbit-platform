import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  type HistoricalPaymentReceiptCandidate,
  type HistoricalPaymentReceiptSyncRepository,
  resolveCanonicalCustomerName,
  resolveCanonicalPilotFolderPath,
  executeHistoricalPaymentReceiptDriveSync,
  hasPilotContext,
  type HistoricalPaymentReceiptCandidateRow,
} from "../features/connectors/google-drive/application/historical-payment-receipt-drive-sync.service.ts";
import type { GoogleDriveLiveProvider } from "../features/connectors/google-drive/provider/google-drive-live.provider.ts";

type DocumentRecord = {
  documentId: string;
  projectId: string;
  paymentId: string | null;
  invoiceId: string | null;
  customerId: string | null;
  customerName: string | null;
  eventDate: string | null;
  storageBucket: string;
  storagePath: string;
  driveFileId: string | null;
  receiptName: string | null;
};

class MockDriveProvider implements GoogleDriveLiveProvider {
  public uploads: Array<{ name: string; mimeType: string; parentFolderId: string | undefined }> = [];
  public reconcile = new Map<string, { id: string; name: string }>();

  public findFileByNameShouldFail = false;
  public uploadShouldFail = false;
  private readonly options: { existing?: Map<string, { id: string; name: string }>; prefix?: string };

  constructor(options: { existing?: Map<string, { id: string; name: string }>; prefix?: string } = {}) {
    this.options = options;
    if (options.existing) this.reconcile = options.existing;
  }

  async findFolder(input: { name: string; parentFolderId?: string }) {
    void input;
    return null;
  }

  async findFileByName(input: { name: string; parentFolderId?: string }) {
    if (this.findFileByNameShouldFail) {
      throw new Error("Token expired");
    }
    return this.reconcile.get(`${input.parentFolderId ?? "root"}/${input.name}`) ?? null;
  }

  async createFolder(input: { name: string; parentFolderId?: string }) {
    return { id: randomUUID(), name: input.name };
  }

  async updateFolder(input: { id: string; name: string; parentFolderId?: string; previousParentFolderId?: string }) {
    void input;
    return { id: input.id, name: input.name };
  }

  async uploadFile(input: { name: string; mimeType: string; bytes: Uint8Array; parentFolderId?: string }) {
    this.uploads.push({ name: input.name, mimeType: input.mimeType, parentFolderId: input.parentFolderId });

    if (this.uploadShouldFail) {
      throw new Error("Drive upload failed");
    }

    const id = `${this.options.prefix ?? "drive"}-${input.name.replace(/[^a-z0-9]+/gi, "-")}-${randomUUID()}`;
    const file = { id, name: input.name };
    this.reconcile.set(`${input.parentFolderId ?? "root"}/${input.name}`, file);
    return file;
  }

}

class MockRepository implements HistoricalPaymentReceiptSyncRepository {
  private readonly documents = new Map<string, DocumentRecord>();

  public downloaded = 0;
  public updated = 0;
  public updateFailures = false;
  public readonly storagePaths = new Set<string>();

  constructor(source: DocumentRecord[], storagePaths?: Iterable<string>) {
    for (const item of source) {
      this.documents.set(item.documentId, { ...item });
    }
    if (storagePaths) {
      for (const path of storagePaths) this.storagePaths.add(path);
    }
  }

  async loadCandidates(input?: { documentIds?: readonly string[] } | undefined): Promise<HistoricalPaymentReceiptCandidate[]> {
    const candidates = [...this.documents.values()];
    const filtered = input?.documentIds?.length
      ? candidates.filter((candidate) => input.documentIds!.includes(candidate.documentId))
      : candidates;

    return filtered.map((item) => ({
      documentId: item.documentId,
      projectId: item.projectId,
      paymentId: item.paymentId,
      invoiceId: item.invoiceId,
      customerId: item.customerId,
      customerName: item.customerName,
      eventDate: item.eventDate,
      storageBucket: item.storageBucket,
      storagePath: item.storagePath,
      driveFileId: item.driveFileId,
      receiptName: item.receiptName,
    }));
  }

  async setDriveFileId(documentId: string, driveFileId: string): Promise<void> {
    if (this.updateFailures) {
      throw new Error("No fue posible persistir en documentos.");
    }

    const existing = this.documents.get(documentId);
    if (!existing) throw new Error("Documento no encontrado.");
    if (existing.driveFileId) throw new Error("Documento ya reconciliado.");

    existing.driveFileId = driveFileId;
    this.updated += 1;
  }

  async downloadReceipt(storageBucket: string, storagePath: string): Promise<{ bytes: Uint8Array; mimeType: string | null }> {
    this.downloaded += 1;
    if (!this.storagePaths.has(storagePath) || storageBucket !== "orbit-documents") {
      throw new Error("No fue posible leer el archivo desde Storage.");
    }

    return {
      bytes: new TextEncoder().encode("receipt"),
      mimeType: "image/png",
    };
  }
}

test("runner marks already linked documents as skipped", async () => {
  const repository = new MockRepository([
    {
      documentId: "doc-linked",
      projectId: "project-1",
      paymentId: null,
      invoiceId: null,
      customerId: "customer-1",
      customerName: "Cliente A",
      eventDate: "2026-06-30",
      storageBucket: "orbit-documents",
      storagePath: "doc-linked.png",
      driveFileId: "drive-linked",
      receiptName: "recibo.png",
    },
  ]);

  const result = await executeHistoricalPaymentReceiptDriveSync({
    client: null as never,
    repository,
    resolveDestination: async () => ({ folderId: "folder", folderPath: "ORBIT", provider: new MockDriveProvider() }),
  });

  assert.equal(result.processed, 1);
  assert.equal(result.skippedAlreadyLinked, 1);
  assert.equal(result.results[0].status, "SKIPPED_ALREADY_LINKED");
  assert.equal(repository.updated, 0);
});

test("runner marks documents with invalid storage as requires review", async () => {
  const repository = new MockRepository([
    {
      documentId: "doc-storage-missing",
      projectId: "project-2",
      paymentId: null,
      invoiceId: null,
      customerId: "customer-1",
      customerName: "Cliente A",
      eventDate: "2026-06-30",
      storageBucket: "orbit-documents",
      storagePath: "missing.png",
      driveFileId: null,
      receiptName: "recibo.png",
    },
  ], ["another.png"]);
  const provider = new MockDriveProvider();

  const result = await executeHistoricalPaymentReceiptDriveSync({
    client: null as never,
    repository,
    resolveDestination: async () => ({ folderId: "folder", folderPath: "ORBIT", provider }),
  });

  assert.equal(result.requiresReview, 1);
  assert.equal(result.results[0].status, "REQUIRES_REVIEW");
  assert.equal(repository.updated, 0);
});

test("runner reports missing context as requires review", async () => {
  const repository = new MockRepository([
    {
      documentId: "doc-missing-context",
      projectId: "project-3",
      paymentId: null,
      invoiceId: null,
      customerId: null,
      customerName: null,
      eventDate: null,
      storageBucket: "orbit-documents",
      storagePath: "project-3/receipt.png",
      driveFileId: null,
      receiptName: null,
    },
  ], ["project-3/receipt.png"]);
  const provider = new MockDriveProvider();

  const result = await executeHistoricalPaymentReceiptDriveSync({
    client: null as never,
    repository,
    resolveDestination: async () => ({ folderId: "folder", folderPath: "ORBIT", provider }),
  });

  assert.equal(result.requiresReview, 1);
  assert.equal(result.results[0].status, "REQUIRES_REVIEW");
  assert.equal(result.results[0].reason, "No fue posible resolver cliente y fecha del evento.");
});

test("runner preserves receipt_name when determining filename", async () => {
  const repository = new MockRepository([
    {
      documentId: "doc-filename",
      projectId: "project-4",
      paymentId: null,
      invoiceId: null,
      customerId: "customer-4",
      customerName: "Cliente C",
      eventDate: "2026-06-30",
      storageBucket: "orbit-documents",
      storagePath: "project-4/legacy.bin",
      driveFileId: null,
      receiptName: "recibo-original.png",
    },
  ], ["project-4/legacy.bin"]);
  const provider = new MockDriveProvider({
    existing: new Map(),
  });

  await executeHistoricalPaymentReceiptDriveSync({
    client: null as never,
    repository,
    resolveDestination: async () => ({ folderId: "folder", folderPath: "ORBIT", provider }),
  });

  assert.equal(provider.uploads.at(0)?.name, "recibo-original.png");
});

test("runner falls back filename to storage basename when receipt_name missing", async () => {
  const repository = new MockRepository([
    {
      documentId: "doc-fallback-basename",
      projectId: "project-4b",
      paymentId: null,
      invoiceId: null,
      customerId: "customer-4b",
      customerName: "Cliente C",
      eventDate: "2026-06-30",
      storageBucket: "orbit-documents",
      storagePath: "project-4b/foto-comprobante.jpg",
      driveFileId: null,
      receiptName: null,
    },
  ], ["project-4b/foto-comprobante.jpg"]);
  const provider = new MockDriveProvider({ existing: new Map() });

  await executeHistoricalPaymentReceiptDriveSync({
    client: null as never,
    repository,
    resolveDestination: async () => ({ folderId: "folder", folderPath: "ORBIT", provider }),
  });

  assert.equal(provider.uploads.at(0)?.name, "foto-comprobante.jpg");
});

test("runner uploads and links receipt to documents", async () => {
  const repository = new MockRepository([
    {
      documentId: "doc-upload-success",
      projectId: "project-5",
      paymentId: null,
      invoiceId: null,
      customerId: "customer-5",
      customerName: "Cliente D",
      eventDate: "2026-06-30",
      storageBucket: "orbit-documents",
      storagePath: "project-5/receipt.png",
      driveFileId: null,
      receiptName: null,
    },
  ], ["project-5/receipt.png"]);
  const provider = new MockDriveProvider();

  const result = await executeHistoricalPaymentReceiptDriveSync({
    client: null as never,
    repository,
    resolveDestination: async () => ({ folderId: "folder", folderPath: "ORBIT", provider }),
  });

  assert.equal(result.inserted, 1);
  assert.equal(result.failed, 0);
  assert.equal(repository.updated, 1);
});

test("runner reconciles existing file instead of uploading", async () => {
  const repository = new MockRepository([
    {
      documentId: "doc-reconciled",
      projectId: "project-8",
      paymentId: null,
      invoiceId: null,
      customerId: "customer-8",
      customerName: "Cliente H",
      eventDate: "2026-06-30",
      storageBucket: "orbit-documents",
      storagePath: "project-8/receipt.png",
      driveFileId: null,
      receiptName: "reconciliar.png",
    },
  ], ["project-8/receipt.png"]);
  const provider = new MockDriveProvider({
    existing: new Map([["folder/reconciliar.png", { id: "existing-drive", name: "reconciliar.png" }]]),
  });

  const result = await executeHistoricalPaymentReceiptDriveSync({
    client: null as never,
    repository,
    resolveDestination: async () => ({ folderId: "folder", folderPath: "ORBIT", provider }),
  });

  assert.equal(result.reconciled, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.results[0].status, "RECONCILED_EXISTING");
  assert.equal(result.results[0].driveFileId, "existing-drive");
  assert.equal(provider.uploads.length, 0);
});

test("runner keeps idempotent on retry after upload failure", async () => {
  const repository = new MockRepository([
    {
      documentId: "doc-update-fail",
      projectId: "project-6",
      paymentId: null,
      invoiceId: null,
      customerId: "customer-6",
      customerName: "Cliente E",
      eventDate: "2026-06-30",
      storageBucket: "orbit-documents",
      storagePath: "project-6/receipt.png",
      driveFileId: null,
      receiptName: null,
    },
  ], ["project-6/receipt.png"]);

  repository.updateFailures = true;
  const provider = new MockDriveProvider();

  const first = await executeHistoricalPaymentReceiptDriveSync({
    client: null as never,
    repository,
    resolveDestination: async () => ({ folderId: "folder", folderPath: "ORBIT", provider }),
  });

  assert.equal(first.failed, 1);
  assert.equal(first.results[0].status, "FAILED");
  assert.equal(provider.uploads.length, 1);

  repository.updateFailures = false;
  const second = await executeHistoricalPaymentReceiptDriveSync({
    client: null as never,
    repository,
    resolveDestination: async () => ({ folderId: "folder", folderPath: "ORBIT", provider }),
  });

  assert.equal(second.processed, 1);
  assert.equal(second.reconciled, 1);
  assert.equal(second.results[0].status, "RECONCILED_EXISTING");
  assert.equal(provider.uploads.length, 1);
  assert.equal(repository.updated, 1);
});

test("runner returns failed when token expired", async () => {
  const repository = new MockRepository([
    {
      documentId: "doc-token",
      projectId: "project-7",
      paymentId: null,
      invoiceId: null,
      customerId: "customer-7",
      customerName: "Cliente F",
      eventDate: "2026-06-30",
      storageBucket: "orbit-documents",
      storagePath: "project-7/receipt.png",
      driveFileId: null,
      receiptName: null,
    },
  ], ["project-7/receipt.png"]);
  const provider = new MockDriveProvider();
  provider.findFileByNameShouldFail = true;

  const result = await executeHistoricalPaymentReceiptDriveSync({
    client: null as never,
    repository,
    resolveDestination: async () => ({ folderId: "folder", folderPath: "ORBIT", provider }),
  });

  assert.equal(result.failed, 1);
  assert.equal(result.results[0].status, "FAILED");
  assert.match(result.results[0].reason ?? "", /Token expired/i);
  assert.equal(result.results[0].folderPath, "ORBIT");
});

test("runner returns failed on Drive error", async () => {
  const repository = new MockRepository([
    {
      documentId: "doc-upload-fail",
      projectId: "project-9",
      paymentId: null,
      invoiceId: null,
      customerId: "customer-9",
      customerName: "Cliente I",
      eventDate: "2026-06-30",
      storageBucket: "orbit-documents",
      storagePath: "project-9/receipt.png",
      driveFileId: null,
      receiptName: null,
    },
  ], ["project-9/receipt.png"]);
  const provider = new MockDriveProvider();
  provider.uploadShouldFail = true;

  const result = await executeHistoricalPaymentReceiptDriveSync({
    client: null as never,
    repository,
    resolveDestination: async () => ({ folderId: "folder", folderPath: "ORBIT", provider }),
  });

  assert.equal(result.failed, 1);
  assert.equal(result.results[0].status, "FAILED");
  assert.equal(repository.updated, 0);
});

test("runner no writes on review-only candidates", async () => {
  const repository = new MockRepository([
    {
      documentId: "doc-review",
      projectId: "project-10",
      paymentId: null,
      invoiceId: null,
      customerId: null,
      customerName: null,
      eventDate: null,
      storageBucket: "orbit-documents",
      storagePath: "project-10/receipt.png",
      driveFileId: null,
      receiptName: null,
    },
  ], ["project-10/receipt.png"]);

  const provider = new MockDriveProvider();

  const result = await executeHistoricalPaymentReceiptDriveSync({
    client: null as never,
    repository,
    resolveDestination: async () => ({ folderId: "folder", folderPath: "ORBIT", provider }),
  });

  assert.equal(result.requiresReview, 1);
  assert.equal(repository.updated, 0);
  assert.equal(provider.uploads.length, 0);
});

test("pilot context filters only png/jpg candidates with event/customer", () => {
  const candidates: readonly HistoricalPaymentReceiptCandidate[] = [
    {
      documentId: "a",
      projectId: "p1",
      paymentId: null,
      invoiceId: null,
      customerId: "c1",
      customerName: "Cliente A",
      eventDate: "2026-06-30",
      storageBucket: "orbit-documents",
      storagePath: "file.png",
      driveFileId: null,
      receiptName: null,
    },
    {
      documentId: "b",
      projectId: "p2",
      paymentId: null,
      invoiceId: null,
      customerId: "c2",
      customerName: "Cliente B",
      eventDate: "2026-06-30",
      storageBucket: "orbit-documents",
      storagePath: "file.pdf",
      driveFileId: null,
      receiptName: null,
    },
  ];

  const pilot = candidates.filter((candidate) => hasPilotContext(candidate));
  assert.equal(pilot.length, 1);
  assert.equal(pilot[0].documentId, "a");
});

test("runner folder path is deterministic for canonical payment proof destination", () => {
  const folderPath = resolveCanonicalPilotFolderPath({
    customerName: "Camila Sandoval",
    eventDate: "2026-12-05",
    rootDriveFolder: "BOOMBOX ORBIT",
  });

  assert.equal(folderPath, "BOOMBOX ORBIT/2026/December/05-12-2026 - Camila Sandoval/02_Comprobantes");
});

test("runner does not use non-canonical customer override", () => {
  const rowFromProject = {
    id: "doc-1",
    invoice_id: null,
    payment_id: null,
    project_id: "project-1",
    customer_id: null,
    drive_file_id: null,
    storage_bucket: null,
    storage_path: null,
    projects: {
      event_date: "2026-12-05",
      customers: [{ full_name: "Camila Sandoval" }],
    },
    customers: { full_name: "Camila Sandangel" },
    invoice_payments: null,
  } satisfies HistoricalPaymentReceiptCandidateRow;

  assert.equal(resolveCanonicalCustomerName(rowFromProject), "Camila Sandoval");
});
