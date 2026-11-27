import "server-only";

import { createHash } from "node:crypto";
import { resolveExistingBillingFolder } from "./existing-billing-folder";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanySettings } from "@/features/company-settings";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleDriveApiProvider } from "../provider/google-drive-live.provider";
import { SupabaseGoogleDriveFolderRepository } from "../repository/google-drive-folder.repository";
import type { GoogleDriveDocumentKind } from "../types/google-drive-live.types";
import { resolveAutomaticDestination } from "./google-drive-folder-strategy";
import { synchronizeConfirmedReservationDrive } from "./google-drive-sync.service";

interface ReservationDocumentContext {
  client: SupabaseClient;
  projectId: string;
  customerName: string;
  eventDate: string;
  kind: GoogleDriveDocumentKind;
  preserveExistingStructure?: boolean;
}

export async function resolveReservationDocumentFolder(input: ReservationDocumentContext) {
  if (input.preserveExistingStructure) {
    if (input.kind !== "INVOICE") throw new Error("El destino SII debe ser Facturación.");
    const { data: project, error } = await input.client.from("projects").select("operations").eq("id", input.projectId).is("deleted_at", null).single();
    if (error) throw error;
    const linked = project.operations?.googleDrive;
    if (!linked?.folderId || !linked?.path) throw new Error("El evento no tiene una carpeta Drive vinculada. Revisa el vínculo antes de adjuntar el documento SII.");
    const folderPath = `${linked.path}/07_Facturación`;
    const repository = new SupabaseGoogleDriveFolderRepository(input.client, input.projectId);
    const stored = await repository.findByPath(folderPath);
    const provider = new GoogleDriveApiProvider(await loadGoogleWorkspaceAccessToken());
    const folderId = await resolveExistingBillingFolder({ provider, eventFolderId: linked.folderId, storedFolderId: stored?.driveFolderId });
    if (folderId !== stored?.driveFolderId) {
      await repository.save({ name: "07_Facturación", path: folderPath, parentPath: linked.path, driveFolderId: folderId, status: "UPDATED", lastUpdatedAt: new Date().toISOString() });
    }
    return { folderId, folderPath, provider };
  }
  const eventFolder = await synchronizeConfirmedReservationDrive({ client: input.client, projectId: input.projectId, recordTimeline: false });
  const company = await loadCompanySettings(input.client);
  const destination = resolveAutomaticDestination({ kind: input.kind, context: { customerName: input.customerName, eventDate: input.eventDate } }, company.driveRootFolder);
  const leaf = destination.folderPath.split("/").at(-1);
  if (!leaf) throw new Error("No fue posible resolver el tipo de carpeta documental.");
  const provider = new GoogleDriveApiProvider(await loadGoogleWorkspaceAccessToken());
  const folder = await provider.findFolder({ name: leaf, parentFolderId: eventFolder.folderId });
  if (!folder) throw new Error("No fue posible verificar la carpeta documental de este evento en Google Drive.");
  return { folderId: folder.id, folderPath: `${eventFolder.folderPath}/${leaf}`, provider };
}

export async function uploadReservationDocumentToDrive(input: ReservationDocumentContext & { name: string; mimeType: string; bytes: Uint8Array }) {
  const destination = await resolveReservationDocumentFolder(input);
  const checksum = input.preserveExistingStructure ? createHash("sha256").update(input.bytes).digest("hex") : undefined;
  const existing = checksum ? await destination.provider.findFilesByName({ name: input.name, parentFolderId: destination.folderId }) : [];
  const md5 = checksum ? createHash("md5").update(input.bytes).digest("hex") : undefined;
  const matching = existing.find(file => file.appProperties?.orbitSha256 === checksum || file.md5Checksum === md5);
  if (existing.length && !matching) throw new Error("Ya existe un archivo con ese nombre y contenido diferente en Facturación. No se reemplazó.");
  const file = matching ?? await destination.provider.uploadFile({ name: input.name, mimeType: input.mimeType, bytes: input.bytes, parentFolderId: destination.folderId, ...(checksum && { appProperties: { orbitSha256: checksum } }) });
  return { ...file, folderId: destination.folderId, folderPath: destination.folderPath };
}

export async function archiveReservationDocumentToDrive(input: ReservationDocumentContext & { name: string; mimeType: string; bytes: Uint8Array }) {
  const destination = await resolveReservationDocumentFolder(input);
  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  const md5 = createHash("md5").update(input.bytes).digest("hex");
  const existing = await destination.provider.findFilesByName({ name: input.name, parentFolderId: destination.folderId });
  if (existing.length > 1 || existing.some(file => file.md5Checksum !== md5)) {
    throw new Error("El nombre del archivo ya existe en Drive y requiere conciliación. Se preservaron los archivos.");
  }
  const file = existing[0] ?? await destination.provider.uploadFile({
    name: input.name,
    mimeType: input.mimeType,
    bytes: input.bytes,
    parentFolderId: destination.folderId,
    appProperties: { orbitSha256: checksum },
  });
  return { ...file, folderId: destination.folderId, folderPath: destination.folderPath, reused: Boolean(existing.length) };
}
