import { google } from "googleapis";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const output = process.argv[2];

const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
if (!output || !parentId || !process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("Drive restore configuration is incomplete; federated credentials are required");
await mkdir(output, { recursive: true });
const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
const drive = google.drive({ version: "v3", auth });
const folders = await drive.files.list({ q: `'${parentId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`, fields: "nextPageToken,files(id,name,createdTime)", orderBy: "createdTime desc", pageSize: 100, supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: "allDrives" });
const requestedId = process.env.ORBIT_RESTORE_FOLDER_ID;
const folder = (folders.data.files ?? []).find((item) => /^ORBIT Supabase backup /.test(item.name ?? "") && (!requestedId || item.id === requestedId));
if (!folder?.id) throw new Error("No backup folder available for isolated restore");
const files = await drive.files.list({ q: `'${folder.id}' in parents and trashed = false`, fields: "nextPageToken,files(id,name,size)", pageSize: 100, supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: "allDrives" });
for (const file of files.data.files ?? []) {
  if (!file.id || !file.name?.endsWith(".enc")) continue;
  const response = await drive.files.get({ fileId: file.id, alt: "media", supportsAllDrives: true }, { responseType: "stream" });
  await new Promise((resolve, reject) => { const target = createWriteStream(join(output, file.name)); response.data.pipe(target); target.on("finish", resolve); target.on("error", reject); });
}
console.log(JSON.stringify({ folderId: folder.id, files: (files.data.files ?? []).filter((file) => file.name?.endsWith(".enc")).length }));
