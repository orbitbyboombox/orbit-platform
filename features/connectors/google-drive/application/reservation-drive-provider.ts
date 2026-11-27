import "server-only";

import {
  loadGoogleWorkspaceAccessToken,
  loadGoogleWorkspaceConnection,
  loadLegacyOwnerDriveRepairToken,
} from "../../google-workspace/application/google-workspace.repository";
import { GoogleDriveApiProvider } from "../provider/google-drive-live.provider";

export const BOOMBOX_ORBIT_ROOT_ID = "1EFHCbHnYYXGlHY4CF0ZUWmInVRnmcfcM";
const BOOMBOX_CLIENTS_ID = "1L8VNZANk-r2u1Mdc1JIYPhBjM0RSHXX2";
const BOOMBOX_DRIVE_OWNER = "matias@boom-box.cl";

export async function loadReservationDriveProvider(input: {
  folderIds?: readonly string[];
  discover?: boolean;
} = {}) {
  const connection = await loadGoogleWorkspaceConnection();
  const primary = new GoogleDriveApiProvider(await loadGoogleWorkspaceAccessToken());
  if (connection.source !== "NOVA" || connection.workspaceAccount?.toLowerCase() !== BOOMBOX_DRIVE_OWNER) {
    return { connection, provider: primary };
  }
  if (connection.driveRootFolderId && connection.driveRootFolderId !== BOOMBOX_ORBIT_ROOT_ID) {
    throw new Error("NOVA apunta a otra raíz de Google Drive. Se preservaron las carpetas existentes.");
  }

  const folderIds = [...new Set([BOOMBOX_ORBIT_ROOT_ID, BOOMBOX_CLIENTS_ID, ...input.folderIds ?? []])];
  const verifyAccess = async (provider: GoogleDriveApiProvider) => {
    for (let index = 0; index < folderIds.length; index += 5) {
      await Promise.all(folderIds.slice(index, index + 5).map(id => provider.readFolder(id)));
    }
  };

  if (!input.discover) {
    try {
      await verifyAccess(primary);
      return { connection, provider: primary };
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("folder lookup failed (404)")) throw error;
    }
  }

  // The narrower drive.file grant cannot safely discover folders it cannot see.
  // Reuse the existing full-Drive grant of the same owner before any mutation.
  const owner = new GoogleDriveApiProvider(await loadLegacyOwnerDriveRepairToken(BOOMBOX_DRIVE_OWNER));
  const approvedRoot = await owner.readFolder(BOOMBOX_ORBIT_ROOT_ID);
  if (approvedRoot.name !== "BOOMBOX ORBIT") throw new Error("La raíz de Drive no coincide con BOOMBOX ORBIT.");
  try {
    await verifyAccess(owner);
  } catch (error) {
    if (error instanceof Error && error.message.includes("folder lookup failed (404)")) {
      throw new Error("La autorización Drive del propietario no ve una carpeta ya vinculada. Se preservaron sus IDs.");
    }
    throw error;
  }
  return { connection, provider: owner };
}
