import { google } from "googleapis";

const credentials = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON ?? "");
const parentId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
if (!parentId) throw new Error("Drive backup parent folder is missing");
const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] });
const drive = google.drive({ version: "v3", auth });
const q = `'${parentId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`;
const listed = await drive.files.list({ q, fields: "files(id,name,createdTime,trashed)", orderBy: "createdTime desc", pageSize: 100, supportsAllDrives: true, includeItemsFromAllDrives: true });
const backups = (listed.data.files ?? []).filter((file) => /^ORBIT Supabase backup /.test(file.name ?? ""));
if (backups.length === 0) throw new Error("No verified backup folder found for retention");
const newest = backups[0];
const newestFiles = await drive.files.list({ q: `'${newest.id}' in parents and trashed = false`, fields: "files(id)", pageSize: 100, supportsAllDrives: true, includeItemsFromAllDrives: true });
if ((newestFiles.data.files ?? []).length === 0) throw new Error("Newest backup folder is empty; retention was not applied");
const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
let trashed = 0;
for (const folder of backups.slice(30)) {
  if (!folder.createdTime || new Date(folder.createdTime).getTime() >= cutoff) continue;
  await drive.files.update({ fileId: folder.id, requestBody: { trashed: true }, fields: "id,trashed", supportsAllDrives: true });
  trashed += 1;
}
console.log(JSON.stringify({ retained: Math.min(backups.length, 30), trashed }));
