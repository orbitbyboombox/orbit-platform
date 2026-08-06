export interface GoogleDriveCreatedFolder {
  id: string;
  name: string;
}

export interface GoogleDriveLiveProvider {
  createFolder(input: { name: string; parentFolderId?: string }): Promise<GoogleDriveCreatedFolder>;
}

export class InMemoryGoogleDriveLiveProvider implements GoogleDriveLiveProvider {
  async createFolder(input: { name: string; parentFolderId?: string }) {
    const scope = input.parentFolderId ? `${input.parentFolderId}-${input.name}` : input.name;
    return { id: `gdrive-${scope.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, name: input.name };
  }
}

export class GoogleDriveApiProvider implements GoogleDriveLiveProvider {
  constructor(private readonly accessToken: string) {}
  async createFolder(input: { name: string; parentFolderId?: string }): Promise<GoogleDriveCreatedFolder> {
    const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", { method: "POST", headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: input.name, mimeType: "application/vnd.google-apps.folder", parents: input.parentFolderId ? [input.parentFolderId] : undefined }) });
    if (!response.ok) throw new Error(`Google Drive request failed (${response.status}): ${await response.text()}`);
    return response.json() as Promise<GoogleDriveCreatedFolder>;
  }
}
