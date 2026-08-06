import type { GoogleDriveFolderRecord } from "../types/google-drive-live.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface GoogleDriveFolderRepository {
  findByPath(path: string): Promise<GoogleDriveFolderRecord | null>;
  save(folder: GoogleDriveFolderRecord): Promise<void>;
}

export class SupabaseGoogleDriveFolderRepository implements GoogleDriveFolderRepository {
  constructor(private readonly client: SupabaseClient, private readonly projectId: string) {}
  async findByPath(path: string): Promise<GoogleDriveFolderRecord | null> {
    const { data, error } = await this.client.from("drive_sync").select("*").eq("project_id", this.projectId).eq("destination_key", path).maybeSingle();
    if (error) throw error;
    return data ? { name: data.destination_key.split("/").at(-1) ?? data.destination_key, path: data.destination_key, parentPath: data.destination_key.includes("/") ? data.destination_key.slice(0, data.destination_key.lastIndexOf("/")) : null, driveFolderId: data.external_folder_id ?? undefined, status: data.status, lastUpdatedAt: data.last_synced_at ?? data.updated_at } as GoogleDriveFolderRecord : null;
  }
  async save(folder: GoogleDriveFolderRecord): Promise<void> {
    const { error } = await this.client.from("drive_sync").upsert({ project_id: this.projectId, destination_key: folder.path, external_folder_id: folder.driveFolderId, status: folder.status, last_synced_at: folder.lastUpdatedAt }, { onConflict: "project_id,destination_key" });
    if (error) throw error;
  }
}

export class InMemoryGoogleDriveFolderRepository implements GoogleDriveFolderRepository {
  private readonly folders = new Map<string, GoogleDriveFolderRecord>();

  async findByPath(path: string) { return this.folders.get(path) ?? null; }
  async save(folder: GoogleDriveFolderRecord) { this.folders.set(folder.path, folder); }
}
