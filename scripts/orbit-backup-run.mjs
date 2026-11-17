import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const [mode, value] = process.argv.slice(2);
const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Backup status database configuration is incomplete");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const output = process.env.GITHUB_OUTPUT;
const writeOutput = (name, result) => output && requireOutput(name, result);
function requireOutput(name, result) {
  // GITHUB_OUTPUT is an append-only file on the runner; no secret is written here.
  return import("node:fs/promises").then(({ appendFile }) => appendFile(output, `${name}=${result}\n`));
}
async function request(path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  if (!response.ok) throw new Error(`Supabase backup audit write failed (${response.status})`);
  return response;
}

if (mode === "ensure") {
  const id = value || randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid backup run id");
  await request("orbit_backup_runs", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id, status: "EN_PROCESO", started_at: new Date().toISOString() }) });
  await writeOutput("backup_run_id", id);
  if (process.env.GITHUB_ENV) await import("node:fs/promises").then(({ appendFile }) => appendFile(process.env.GITHUB_ENV, `BACKUP_RUN_ID=${id}\n`));
  process.exit(0);
}

if (!["complete", "error"].includes(mode)) throw new Error("Unknown backup audit mode");
const id = process.env.BACKUP_RUN_ID;
if (!id) process.exit(0);
const patch = { status: mode === "complete" ? "COMPLETO" : "ERROR", completed_at: new Date().toISOString(), github_run_id: Number(process.env.GITHUB_RUN_ID || 0) || null, workflow_url: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null };
if (mode === "error") {
  patch.error_code = process.env.BACKUP_ERROR_CODE || "WORKFLOW_FAILED";
  patch.error_message = "La ejecución del respaldo falló. Revisa el enlace de GitHub Actions para el detalle técnico.";
} else if (process.env.BACKUP_RESULT_FILE) {
  const result = JSON.parse(await readFile(process.env.BACKUP_RESULT_FILE, "utf8"));
  const uploaded = Array.isArray(result.uploaded) ? result.uploaded : [];
  patch.file_count = uploaded.length;
  patch.total_bytes = uploaded.reduce((sum, file) => sum + Number(file.size || 0), 0);
  patch.drive_folder_id = result.folderId || null;
  patch.sha256_manifest = createHash("sha256").update(JSON.stringify(uploaded.map(({ name, size, sha256 }) => ({ name, size, sha256 })))).digest("hex");
}
await request(`orbit_backup_runs?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) });
if (mode === "error") {
  await request("internal_notifications", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      notification_type: "ORBIT_BACKUP_FAILED",
      title: "Falló un respaldo ORBIT",
      message: "El respaldo no se completó. Revisa la ejecución de GitHub Actions antes de iniciar otra copia.",
      status: "UNREAD",
      correlation_id: `orbit-backup-failed:${id}`,
      category: "SYSTEM",
      priority: "CRITICAL",
      action_required: true,
      entity_type: "OrbitBackupRun",
      entity_id: id,
      related_href: "/settings#orbit-backups",
      metadata: { error_code: patch.error_code, workflow_url: patch.workflow_url },
    }),
  });
}
