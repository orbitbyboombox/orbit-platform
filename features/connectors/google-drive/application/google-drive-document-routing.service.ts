import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanySettings } from "@/features/company-settings";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleDriveApiProvider } from "../provider/google-drive-live.provider";
import { SupabaseGoogleDriveFolderRepository } from "../repository/google-drive-folder.repository";
import type { GoogleDriveDocumentKind } from "../types/google-drive-live.types";
import { buildCustomerFolderPlan, buildRootFolderPlan, resolveAutomaticDestination } from "./google-drive-folder-strategy";
import { GoogleDriveLive } from "./google-drive-live";

interface ReservationDocumentContext {
  client: SupabaseClient;
  projectId: string;
  customerName: string;
  eventDate: string;
  kind: GoogleDriveDocumentKind;
}

export async function resolveReservationDocumentFolder(input: ReservationDocumentContext) {
  const [company, accessToken, connection] = await Promise.all([
    loadCompanySettings(input.client),
    loadGoogleWorkspaceAccessToken(),
    loadGoogleWorkspaceConnection(),
  ]);
  const provider = new GoogleDriveApiProvider(accessToken);
  const drive = new GoogleDriveLive(connection, provider, new SupabaseGoogleDriveFolderRepository(input.client, input.projectId));
  const synchronizedAt = new Date().toISOString();
  const root = await drive.synchronizeFolderPlan(buildRootFolderPlan(company.driveRootFolder), synchronizedAt);
  if (!root.ok) throw new Error(root.error.message);
  const folders = await drive.synchronizeFolderPlan(buildCustomerFolderPlan(input.customerName, input.eventDate, company.driveRootFolder), synchronizedAt);
  if (!folders.ok) throw new Error(folders.error.message);
  const destination = resolveAutomaticDestination({ kind: input.kind, context: { customerName: input.customerName, eventDate: input.eventDate } }, company.driveRootFolder);
  const folder = folders.folders.find((item) => item.path === destination.folderPath);
  if (!folder?.driveFolderId) throw new Error("No fue posible resolver la carpeta documental en Google Drive.");
  return { folderId: folder.driveFolderId, folderPath: folder.path, provider };
}

export async function uploadReservationDocumentToDrive(input: ReservationDocumentContext & { name: string; mimeType: string; bytes: Uint8Array }) {
  const destination = await resolveReservationDocumentFolder(input);
  const file = await destination.provider.uploadFile({ name: input.name, mimeType: input.mimeType, bytes: input.bytes, parentFolderId: destination.folderId });
  return { ...file, folderId: destination.folderId, folderPath: destination.folderPath };
}
