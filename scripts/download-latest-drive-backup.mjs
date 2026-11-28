import { google } from "googleapis";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const output = process.argv[2];

const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
if (!output || !parentId || !process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("Drive restore configuration is incomplete; federated credentials are required");
await mkdir(output, { recursive: true });
const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
const drive = google.drive({ version: "v3", auth });
const required = new Set(["backup-manifest.json.enc", "database-data.sql.enc", "database-schema.sql.enc",
  "source-code.tar.gz.enc", "storage-manifest.json.enc", "storage.tar.gz.enc", "sha256sums.txt.enc"]);
const folderId = process.env.ORBIT_RESTORE_FOLDER_ID;
if (parentId !== "0AGRNujUa7zHEUk9PVA" || !/^[A-Za-z0-9_-]+$/.test(folderId ?? "")) {
  throw new Error("The exact backup folder and approved drive are required.");
}
const folder = await drive.files.get({ fileId: folderId, supportsAllDrives: true,
  fields: "id,name,parents,driveId,trashed" });
if (folder.data.trashed || folder.data.driveId !== parentId || folder.data.parents?.length !== 1
  || folder.data.parents[0] !== parentId || !/^ORBIT Supabase backup /.test(folder.data.name ?? "")) {
  throw new Error("The backup folder is outside the approved drive.");
}
const files = await drive.files.list({ q: `'${folderId}' in parents and trashed = false`,
  fields: "nextPageToken,files(id,name,size)", pageSize: 100, supportsAllDrives: true,
  includeItemsFromAllDrives: true, corpora: "drive", driveId: parentId });
const found = files.data.files ?? [];
if (files.data.nextPageToken || found.length !== required.size
  || found.some(file => !file.id || !required.delete(file.name))) {
  throw new Error("The encrypted backup set is missing files or contains duplicate filenames.");
}
for (const file of found) {
  const response = await drive.files.get({ fileId: file.id, alt: "media", supportsAllDrives: true }, { responseType: "stream" });
  await pipeline(response.data, createWriteStream(join(output, file.name), { mode: 0o600, flags: "wx" }));
}
console.log(JSON.stringify({ folderId, files: found.length }));
