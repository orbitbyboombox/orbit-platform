import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const project = "uiwlcmbrowtmqwhnsnxz";
const pooler = "aws-1-us-west-2.pooler.supabase.com";

export function sessionPoolerConnection(secret) {
  if (!secret) throw new Error("Supabase backup secret is missing.");
  let url;
  try { url = new URL(secret); } catch { throw new Error("Supabase backup secret format is invalid."); }
  const direct = url.hostname === `db.${project}.supabase.co` && url.username === "postgres";
  const pool = url.hostname === pooler && url.username === `postgres.${project}`;
  if ((!direct && !pool) || !["postgres:", "postgresql:"].includes(url.protocol)
    || url.pathname !== "/postgres" || !url.password || (url.port && url.port !== "5432")) {
    throw new Error("Supabase backup secret does not match the approved project and Session Pooler.");
  }
  const password = decodeURIComponent(url.password);
  if (/[\r\n\0]/.test(password)) throw new Error("Invalid backup password format.");
  return { PGHOST: pooler, PGPORT: "5432", PGUSER: `postgres.${project}`, PGDATABASE: "postgres",
    PGPASSWORD: password, PGSSLMODE: "require", PGCONNECT_TIMEOUT: "10" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const settings = sessionPoolerConnection(process.env.SOURCE_DB_URL);
  const mask = settings.PGPASSWORD.replaceAll("%", "%25");
  process.stdout.write(`::add-mask::${mask}\n`);
  await appendFile(process.env.GITHUB_ENV, Object.entries(settings).map(([key, value]) => `${key}=${value}\n`).join(""));
}
