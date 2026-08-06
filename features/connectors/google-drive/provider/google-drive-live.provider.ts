export interface GoogleDriveCreatedFolder {
  id: string;
  name: string;
}
export interface GoogleDriveUploadedFile { id: string; name: string; }

export interface GoogleDriveLiveProvider {
  createFolder(input: { name: string; parentFolderId?: string }): Promise<GoogleDriveCreatedFolder>;
  uploadFile(input: { name: string; mimeType: string; bytes: Uint8Array; parentFolderId?: string }): Promise<GoogleDriveUploadedFile>;
}

export class InMemoryGoogleDriveLiveProvider implements GoogleDriveLiveProvider {
  async createFolder(input: { name: string; parentFolderId?: string }) {
    const scope = input.parentFolderId ? `${input.parentFolderId}-${input.name}` : input.name;
    return { id: `gdrive-${scope.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, name: input.name };
  }
  async uploadFile(input: { name: string }) { return { id: `gdrive-file-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: input.name }; }
}

export class GoogleDriveApiProvider implements GoogleDriveLiveProvider {
  constructor(private readonly accessToken: string) {}
  async createFolder(input: { name: string; parentFolderId?: string }): Promise<GoogleDriveCreatedFolder> {
    const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", { method: "POST", headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: input.name, mimeType: "application/vnd.google-apps.folder", parents: input.parentFolderId ? [input.parentFolderId] : undefined }) });
    if (!response.ok) throw new Error(`Google Drive request failed (${response.status}): ${await response.text()}`);
    return response.json() as Promise<GoogleDriveCreatedFolder>;
  }
  async uploadFile(input: { name: string; mimeType: string; bytes: Uint8Array; parentFolderId?: string }): Promise<GoogleDriveUploadedFile> {
    const boundary = `orbit-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({ name: input.name, parents: input.parentFolderId ? [input.parentFolderId] : undefined });
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`, input.bytes as BlobPart, `\r\n--${boundary}--`]);
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name", { method: "POST", headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body });
    if (!response.ok) throw new Error(`Google Drive upload failed (${response.status}): ${await response.text()}`);
    return response.json() as Promise<GoogleDriveUploadedFile>;
  }
}
