import { google } from "googleapis";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { assertReadback } from "./backup-integrity.mjs";

const [, , directory] = process.argv;
const credentials = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON ?? "");
const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
if (!directory || !parentId) throw new Error("Drive backup configuration is incomplete");
const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] });
const drive = google.drive({ version: "v3", auth });
const folder = await drive.files.create({ requestBody: { name: `ORBIT Supabase backup ${new Date().toISOString()}`, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }, fields: "id,name", supportsAllDrives: true });
const folderId = folder.data.id;
if (!folderId) throw new Error("Drive did not return backup folder id");
const uploaded = [];
async function localHash(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return { size: (await stat(filePath)).size, sha256: hash.digest("hex") };
}
async function driveHash(fileId) {
  const response = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "stream" });
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of response.data) { size += chunk.length; hash.update(chunk); }
  return { size, sha256: hash.digest("hex") };
}
for (const name of await readdir(directory)) {
  if (!name.endsWith(".enc")) continue;
  const filePath = join(directory, name);
  const expected = await localHash(filePath);
  const created = await drive.files.create({ requestBody: { name, parents: [folderId] }, media: { mimeType: "application/octet-stream", body: createReadStream(filePath) }, fields: "id,name,size", supportsAllDrives: true });
  if (!created.data.id) throw new Error(`Drive upload returned no id: ${name}`);
  const actual = await driveHash(created.data.id);
  assertReadback(expected, actual, name);
  uploaded.push({ name, id: created.data.id, ...expected });
}
if (new Set(uploaded.map((file) => file.name)).size !== uploaded.length || uploaded.length === 0) throw new Error("Drive upload set is empty or duplicated");
console.log(JSON.stringify({ folderId, uploaded: uploaded.map(({ name, id, size, sha256 }) => ({ name, id, size, sha256 })) }));
