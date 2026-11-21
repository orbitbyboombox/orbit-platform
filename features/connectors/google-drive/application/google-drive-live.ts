import type { GoogleWorkspaceConnection } from "../../google-workspace";
import type { GoogleDriveLiveProvider } from "../provider/google-drive-live.provider";
import type { GoogleDriveFolderRepository } from "../repository/google-drive-folder.repository";
import type { GoogleDriveFolderPlanItem, GoogleDriveFolderRecord, GoogleDriveFolderSyncResult } from "../types/google-drive-live.types";

export class GoogleDriveLive {
  constructor(private readonly workspace: GoogleWorkspaceConnection, private readonly provider: GoogleDriveLiveProvider, private readonly repository: GoogleDriveFolderRepository) {}

  async synchronizeFolderPlan(plan: readonly GoogleDriveFolderPlanItem[], synchronizedAt: string): Promise<GoogleDriveFolderSyncResult> {
    if (this.workspace.connectionStatus !== "CONNECTED" || this.workspace.health !== "HEALTHY") {
      return { ok: false, folders: [], error: { code: "WORKSPACE_UNAVAILABLE", message: "Google Workspace no está disponible.", retryable: true } };
    }
    if (!this.workspace.grantedServices.some((service) => service.id === "DRIVE" && service.granted)) {
      return { ok: false, folders: [], error: { code: "DRIVE_SCOPE_MISSING", message: "Google Drive no fue autorizado en la conexión de Workspace.", retryable: false } };
    }
    const synchronized: GoogleDriveFolderRecord[] = [];
    try {
      for (const planned of plan) {
        const existing = await this.repository.findByPath(planned.path);
        if (existing) {
          if (!existing.driveFolderId) {
            throw new Error(`DRIVE_FOLDER_ID_MISSING: ${planned.path}`);
          }
          // Never silently reuse a stale or relocated Drive ID. A cached row is not
          // proof that its folder still exists beneath the expected parent.
          if (this.provider.getFolderParents && existing.driveFolderId) {
            const actualParents = await this.provider.getFolderParents(existing.driveFolderId);
            const expectedParent = planned.parentPath
              ? await this.repository.findByPath(planned.parentPath)
              : null;
            if (planned.parentPath && !expectedParent?.driveFolderId) {
              throw new Error(`DRIVE_PARENT_UNRESOLVED: ${planned.parentPath}`);
            }
            if (planned.parentPath && !actualParents.includes(expectedParent!.driveFolderId!)) {
              throw new Error(`DRIVE_PARENT_MISMATCH: ${planned.path}. Reconcile the verified Drive folder before uploading.`);
            }
          }
          const updated = { ...existing, status: "UPDATED" as const, lastUpdatedAt: synchronizedAt };
          await this.repository.save(updated); synchronized.push(updated); continue;
        }
        const parent = planned.parentPath ? await this.repository.findByPath(planned.parentPath) : null;
        if (planned.parentPath && !parent?.driveFolderId) {
          throw new Error(`DRIVE_PARENT_UNRESOLVED: ${planned.parentPath}`);
        }
        const located = await this.provider.findFolder({ name: planned.name, parentFolderId: parent?.driveFolderId });
        const created = located ?? await this.provider.createFolder({ name: planned.name, parentFolderId: parent?.driveFolderId });
        const record = { ...planned, driveFolderId: created.id, status: (located ? "UPDATED" : "CREATED") as "UPDATED" | "CREATED", lastUpdatedAt: synchronizedAt };
        await this.repository.save(record); synchronized.push(record);
      }
      return { ok: true, folders: synchronized };
    } catch (error) {
      return { ok: false, folders: synchronized, error: { code: "PROVIDER_ERROR", message: error instanceof Error ? error.message : "No fue posible preparar la estructura de Google Drive.", retryable: true } };
    }
  }
}
