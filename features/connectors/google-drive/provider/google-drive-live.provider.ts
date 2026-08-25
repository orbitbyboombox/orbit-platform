export interface GoogleDriveCreatedFolder {
  id: string;
  name: string;
}

export interface GoogleDriveFoundFile {
  id: string;
  name: string;
}

export interface GoogleDriveUploadedFile { id: string; name: string; }

export interface GoogleDriveLiveProvider {
  findFolder(input: { name: string; parentFolderId?: string }): Promise<GoogleDriveCreatedFolder | null>;
  findFileByName(input: { name: string; parentFolderId?: string }): Promise<GoogleDriveFoundFile | null>;
  createFolder(input: { name: string; parentFolderId?: string }): Promise<GoogleDriveCreatedFolder>;
  getFolderParents?(id: string): Promise<string[]>;
  updateFolder(input: { id: string; name: string; parentFolderId?: string; previousParentFolderId?: string }): Promise<GoogleDriveCreatedFolder>;
  uploadFile(input: { name: string; mimeType: string; bytes: Uint8Array; parentFolderId?: string }): Promise<GoogleDriveUploadedFile>;
}

export class InMemoryGoogleDriveLiveProvider implements GoogleDriveLiveProvider {
  private readonly folders = new Map<string, GoogleDriveCreatedFolder>();
  private readonly parents = new Map<string, string[]>();
  private readonly files = new Map<string, GoogleDriveFoundFile[]>();

  async findFolder(input: { name: string; parentFolderId?: string }) {
    return this.folders.get(`${input.parentFolderId ?? "root"}/${input.name}`) ?? null;
  }

  async findFileByName(input: { name: string; parentFolderId?: string }) {
    return this.files.get(`${input.parentFolderId ?? "root"}/${input.name}`)?.at(0) ?? null;
  }

  async createFolder(input: { name: string; parentFolderId?: string }) {
    const existing = await this.findFolder(input);
    if (existing) return existing;
    const scope = input.parentFolderId ? `${input.parentFolderId}-${input.name}` : input.name;
    const created = {
      id: `gdrive-${scope.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      name: input.name,
    };
    this.folders.set(`${input.parentFolderId ?? "root"}/${input.name}`, created);
    this.parents.set(created.id, [input.parentFolderId ?? "root"]);
    return created;
  }

  async getFolderParents(id: string) { return this.parents.get(id) ?? []; }

  async updateFolder(input: { id: string; name: string; parentFolderId?: string; previousParentFolderId?: string }) {
    if (input.parentFolderId) this.parents.set(input.id, [input.parentFolderId]);
    return { id: input.id, name: input.name };
  }

  async uploadFile(input: { name: string; mimeType: string; bytes: Uint8Array; parentFolderId?: string }) {
    const created = {
      id: `gdrive-file-${(input.parentFolderId ?? "root")}-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: input.name,
    };
    const key = `${input.parentFolderId ?? "root"}/${input.name}`;
    const existing = this.files.get(key) ?? [];
    if (!existing.some((file) => file.id === created.id)) {
      existing.push(created);
      this.files.set(key, existing);
    }
    return created;
  }
}

export class GoogleDriveApiProvider implements GoogleDriveLiveProvider {
  constructor(private readonly accessToken: string) {}

  async findFolder(input: { name: string; parentFolderId?: string }): Promise<GoogleDriveCreatedFolder | null> {
    const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const parent = input.parentFolderId ? `'${escape(input.parentFolderId)}' in parents` : "'root' in parents";
    const query = [
      "mimeType = 'application/vnd.google-apps.folder'",
      `name = '${escape(input.name)}'`,
      "trashed = false",
      parent,
    ].join(" and ");
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", query);
    url.searchParams.set("fields", "files(id,name)");
    url.searchParams.set("pageSize", "1");

    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!response.ok) throw new Error(`Google Drive lookup failed (${response.status}): ${await response.text()}`);
    const body = await response.json() as { files?: GoogleDriveCreatedFolder[] };
    return body.files?.[0] ?? null;
  }

  async findFileByName(input: { name: string; parentFolderId?: string }): Promise<GoogleDriveFoundFile | null> {
    const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const parent = input.parentFolderId ? `'${escape(input.parentFolderId)}' in parents` : "'root' in parents";
    const query = [`name = '${escape(input.name)}'`, "trashed = false", parent].join(" and ");
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", query);
    url.searchParams.set("fields", "files(id,name)");
    url.searchParams.set("pageSize", "1");

    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!response.ok) {
      throw new Error(`Google Drive file lookup failed (${response.status}): ${await response.text()}`);
    }
    const body = await response.json() as { files?: GoogleDriveFoundFile[] };
    return body.files?.[0] ?? null;
  }

  async getFolderParents(id: string): Promise<string[]> {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=parents`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!response.ok) throw new Error(`Google Drive parent lookup failed (${response.status}): ${await response.text()}`);
    const body = await response.json() as { parents?: string[] };
    return body.parents ?? [];
  }

  async createFolder(input: { name: string; parentFolderId?: string }): Promise<GoogleDriveCreatedFolder> {
    const existing = await this.findFolder(input);
    if (existing) return existing;
    const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.name,
        mimeType: "application/vnd.google-apps.folder",
        parents: input.parentFolderId ? [input.parentFolderId] : undefined,
      }),
    });
    if (!response.ok) throw new Error(`Google Drive request failed (${response.status}): ${await response.text()}`);
    return response.json() as Promise<GoogleDriveCreatedFolder>;
  }

  async updateFolder(input: { id: string; name: string; parentFolderId?: string; previousParentFolderId?: string }): Promise<GoogleDriveCreatedFolder> {
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.id)}`);
    url.searchParams.set("fields", "id,name");
    if (input.parentFolderId && input.parentFolderId !== input.previousParentFolderId) url.searchParams.set("addParents", input.parentFolderId);
    if (input.previousParentFolderId && input.parentFolderId !== input.previousParentFolderId) url.searchParams.set("removeParents", input.previousParentFolderId);
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: input.name }),
    });
    if (!response.ok) throw new Error(`Google Drive folder update failed (${response.status}): ${await response.text()}`);
    return response.json() as Promise<GoogleDriveCreatedFolder>;
  }

  async uploadFile(input: { name: string; mimeType: string; bytes: Uint8Array; parentFolderId?: string }): Promise<GoogleDriveUploadedFile> {
    const boundary = `orbit-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({ name: input.name, parents: input.parentFolderId ? [input.parentFolderId] : undefined });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
      input.bytes as BlobPart,
      `\r\n--${boundary}--`,
    ]);
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!response.ok) throw new Error(`Google Drive upload failed (${response.status}): ${await response.text()}`);
    return response.json() as Promise<GoogleDriveUploadedFile>;
  }
}
