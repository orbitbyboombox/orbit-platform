import { google } from "googleapis";
import { readFile } from "node:fs/promises";

const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
const resultFile = process.env.BACKUP_RESULT_FILE;
if (!parentId || !process.env.GOOGLE_APPLICATION_CREDENTIALS || !resultFile) throw new Error("Federated Drive backup configuration or verified upload result is missing");
const result = JSON.parse(await readFile(resultFile, "utf8"));
if (!result.folderId || !Array.isArray(result.uploaded) || result.uploaded.length !== 7) throw new Error("Current backup upload is incomplete; retention was not applied");
const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/drive"] });
const drive = google.drive({ version: "v3", auth });
const folderMime = "application/vnd.google-apps.folder";
async function listAll(q, fields) {
  const all = [];
  let pageToken;
  do {
    const page = await drive.files.list({ q, fields, orderBy: "createdTime desc", pageSize: 100, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: "allDrives" });
    all.push(...(page.data.files ?? []));
    pageToken = page.data.nextPageToken;
  } while (pageToken);
  return all;
}
const q = `'${parentId}' in parents and trashed = false and mimeType = '${folderMime}'`;
const backups = (await listAll(q, "nextPageToken,files(id,name,createdTime,trashed)")).filter((file) => /^ORBIT Supabase backup /.test(file.name ?? ""));
const current = backups.find((file) => file.id === result.folderId);
if (!current) throw new Error("The newly verified Drive backup folder is not present in the configured destination");
const currentItems = await listAll(`'${current.id}' in parents and trashed = false`, "nextPageToken,files(id,name,size)");
const currentByName = new Map(currentItems.map((file) => [file.name, file]));
for (const item of result.uploaded) {
  const stored = currentByName.get(item.name);
  if (!stored?.id || Number(stored.size) !== item.size) throw new Error(`Current Drive backup failed post-upload inventory check: ${item.name}`);
}
const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
let trashed = 0;
for (const folder of backups) {
  if (folder.id === current.id || !folder.createdTime || new Date(folder.createdTime).getTime() >= cutoff) continue;
  await drive.files.update({ fileId: folder.id, requestBody: { trashed: true }, fields: "id,trashed", supportsAllDrives: true });
  trashed += 1;
}
console.log(JSON.stringify({ currentFolderId: current.id, verifiedFiles: result.uploaded.length, retained: backups.length - trashed, trashedOlderThanDays: 30 }));
