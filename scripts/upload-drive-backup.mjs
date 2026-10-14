import { google } from "googleapis";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

const [, , directory] = process.argv;
const credentials = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON ?? "");
const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
if (!directory || !parentId) throw new Error("Drive backup configuration is incomplete");
const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] });
const drive = google.drive({ version: "v3", auth });
const folder = await drive.files.create({ requestBody: { name: `ORBIT Supabase backup ${new Date().toISOString()}`, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }, fields: "id,name", supportsAllDrives: true });
const folderId = folder.data.id;
if (!folderId) throw new Error("Drive did not return backup folder id");
for (const name of await readdir(directory)) {
  if (!name.endsWith(".enc") && !name.endsWith(".json") && name !== "sha256sums.txt") continue;
  await drive.files.create({ requestBody: { name, parents: [folderId] }, media: { mimeType: "application/octet-stream", body: createReadStream(join(directory, name)) }, fields: "id,name,size,md5Checksum", supportsAllDrives: true });
}
console.log(JSON.stringify({ folderId, uploaded: "encrypted artifacts and manifests" }));
