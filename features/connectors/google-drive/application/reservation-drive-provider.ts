import "server-only";

import {
  loadGoogleWorkspaceAccessToken,
  loadGoogleWorkspaceConnection,
  loadLegacyOwnerDriveRepairToken,
} from "../../google-workspace/application/google-workspace.repository";
import { GoogleDriveApiProvider } from "../provider/google-drive-live.provider";

const BOOMBOX_ORBIT_ROOT_ID = "1EFHCbHnYYXGlHY4CF0ZUWmInVRnmcfcM";

export async function loadReservationDriveProvider() {
  const connection = await loadGoogleWorkspaceConnection();
  const primary = new GoogleDriveApiProvider(await loadGoogleWorkspaceAccessToken());
  if (connection.source !== "NOVA" || !connection.workspaceAccount) return { connection, provider: primary };
  if (connection.driveRootFolderId && connection.driveRootFolderId !== BOOMBOX_ORBIT_ROOT_ID) {
    return { connection, provider: primary };
  }
  try {
    await primary.readFolder(BOOMBOX_ORBIT_ROOT_ID);
    return { connection, provider: primary };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("folder lookup failed (404)")) throw error;
    // Reuse only the prior full-Drive authorization of the exact same owner.
    // This neither reconnects the account nor changes Calendar or Gmail.
    const owner = new GoogleDriveApiProvider(await loadLegacyOwnerDriveRepairToken(connection.workspaceAccount));
    const approvedRoot = await owner.readFolder(BOOMBOX_ORBIT_ROOT_ID);
    if (approvedRoot.name !== "BOOMBOX ORBIT") throw new Error("La raíz de Drive no coincide con BOOMBOX ORBIT.");
    return { connection, provider: owner };
  }
}
