import { createHash, randomUUID } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";

const [mode, suppliedId] = process.argv.slice(2);
const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const githubId = process.env.GITHUB_RUN_ID;
const sourceSha = process.env.GITHUB_SHA;
if (!url || !key || !/^\d+$/.test(githubId ?? "") || !/^[a-f\d]{40}$/.test(sourceSha ?? "")) {
  throw new Error("Backup audit configuration is incomplete.");
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
async function request(path, method, body) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method, headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Backup audit operation failed (HTTP ${response.status}).`);
  return response.json();
}

if (mode === "start") {
  const id = suppliedId || randomUUID();
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) throw new Error("Invalid backup request id.");
  const state = { status: "EN_PROCESO", started_at: new Date().toISOString(),
    github_run_id: githubId, source_sha: sourceSha };
  const rows = suppliedId
    ? await request(`orbit_backup_runs?id=eq.${id}&status=eq.PENDIENTE`, "PATCH", state)
    : await request("orbit_backup_runs", "POST", { ...state, id });
  if (rows.length !== 1) throw new Error("The backup request was already claimed or does not exist.");
  await appendFile(process.env.GITHUB_ENV, `ORBIT_ACTIVE_BACKUP_ID=${id}\n`);
} else {
  const id = process.env.ORBIT_ACTIVE_BACKUP_ID;
  if (!id) throw new Error("No active backup request id.");
  const endpoint = `orbit_backup_runs?id=eq.${id}&github_run_id=eq.${githubId}`;
  const now = new Date().toISOString();
  let patch;
  let previous;
  if (mode === "complete") {
    const result = JSON.parse(await readFile(process.env.BACKUP_RESULT_FILE, "utf8"));
    const uploaded = result.uploaded ?? [];
    if (!/^[A-Za-z0-9_-]+$/.test(result.folderId ?? "") || uploaded.length !== 7
      || new Set(uploaded.map(file => file.name)).size !== 7
      || uploaded.some(file => !Number.isSafeInteger(file.size) || file.size <= 0 || !/^[a-f\d]{64}$/.test(file.sha256))) {
      throw new Error("Backup readback did not contain the complete encrypted set.");
    }
    patch = { status: "COMPLETO", completed_at: now, drive_folder_id: result.folderId, file_count: uploaded.length,
      total_bytes: uploaded.reduce((sum, file) => sum + file.size, 0),
      sha256_manifest: createHash("sha256").update(JSON.stringify(uploaded.map(({ name, size, sha256 }) => ({ name, size, sha256 })))).digest("hex") };
    previous = "status=eq.EN_PROCESO";
  } else if (mode === "verify") {
    patch = { status: "VERIFICADO", verified_at: now };
    previous = "status=eq.COMPLETO";
  } else if (mode === "error") {
    patch = { status: "ERROR", completed_at: now, error_code: "WORKFLOW_FAILED",
      error_message: "El respaldo requiere revisión. Consulta la ejecución en GitHub antes de iniciar otra copia." };
    previous = "status=in.(EN_PROCESO,COMPLETO)";
  } else {
    throw new Error("Unknown backup audit operation.");
  }
  const changed = await request(`${endpoint}&${previous}`, "PATCH", patch);
  if (changed.length !== 1) throw new Error("The backup status could not be recorded.");
  if (mode === "error") {
    await request("internal_notifications", "POST", {
      notification_type: "ORBIT_BACKUP_FAILED", title: "Falló un respaldo ORBIT",
      message: patch.error_message, status: "UNREAD", correlation_id: `orbit-backup-failed:${id}`,
      category: "SYSTEM", priority: "CRITICAL", action_required: true,
      entity_type: "OrbitBackupRun", entity_id: id, related_href: "/settings/backups",
    });
  }
}
