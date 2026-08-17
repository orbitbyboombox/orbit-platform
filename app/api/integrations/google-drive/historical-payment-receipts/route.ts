import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadCompanySettings } from "@/features/company-settings";
import { getGoogleWorkspaceAdministrator } from "@/features/connectors/google-workspace/application/google-workspace.authorization.guard";
import {
  DefaultHistoricalPaymentReceiptDriveSyncRepository,
  executeHistoricalPaymentReceiptDriveSync,
  resolveCanonicalPilotFolderPath,
  hasPilotContext,
  type HistoricalPaymentReceiptCandidate,
} from "@/features/connectors/google-drive/application/historical-payment-receipt-drive-sync.service";

function splitFileName(storagePath: string): string {
  return storagePath.split("/").at(-1) ?? "receipt";
}

function isStorageObjectPresent(client: ReturnType<typeof createAdminClient>, bucket: string, path: string): Promise<boolean> {
  return client.storage.from(bucket)
    .download(path)
    .then(({ data, error }) => Boolean(data) && !error)
    .catch(() => false);
}

function asPilotSummary(candidate: HistoricalPaymentReceiptCandidate, folderPath: string | null) {
  return {
    documentId: candidate.documentId,
    paymentId: candidate.paymentId,
    cliente: candidate.customerName,
    evento: candidate.eventDate,
    storagePath: candidate.storagePath,
    folder: folderPath,
    filename: candidate.receiptName ?? splitFileName(candidate.storagePath),
    drive_file_id: candidate.driveFileId,
  };
}

export async function GET() {
  const user = await getGoogleWorkspaceAdministrator();
  if (!user) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });

  const admin = createAdminClient();
  const company = await loadCompanySettings(admin);
  const repository = new DefaultHistoricalPaymentReceiptDriveSyncRepository(admin);

  const candidates = await repository.loadCandidates();
  let pilot: ReturnType<typeof asPilotSummary> | null = null;

  for (const candidate of candidates.filter((item) => hasPilotContext(item))) {
    const customerName = candidate.customerName;
    const eventDate = candidate.eventDate;
    if (!customerName || !eventDate) continue;

    const storageObjectExists = await isStorageObjectPresent(admin, candidate.storageBucket, candidate.storagePath);
    if (!storageObjectExists) continue;

    pilot = asPilotSummary(
      candidate,
      resolveCanonicalPilotFolderPath({
        customerName,
        eventDate,
        rootDriveFolder: company.driveRootFolder,
      }),
    );
    break;
  }

  return NextResponse.json({
    ok: true,
    total: candidates.length,
    pilot,
  });
}

export async function POST(request: NextRequest) {
  const user = await getGoogleWorkspaceAdministrator();
  if (!user) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });

  try {
    const payload = (await request.json().catch(() => ({}))) as {
      documentIds?: string[];
      documentId?: string;
    };

    const documentIds = payload.documentId
      ? [payload.documentId]
      : payload.documentIds;

    if (documentIds && documentIds.some((id) => typeof id !== "string" || !id.trim())) {
      return NextResponse.json({ ok: false, error: "La lista de documentos contiene identificadores inválidos." }, { status: 400 });
    }

    const admin = createAdminClient();
    const result = await executeHistoricalPaymentReceiptDriveSync({
      client: admin,
      documentIds,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible ejecutar la sincronización.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
