import { execFileSync } from "node:child_process";

const APP_DIR = "/Users/matiasmaira/Documents/ORBIT DEV-001 Foundation";
const CORE_DIR = "/Users/matiasmaira/Documents/ChatGPT/orbit-nova-connect";
const ORGANIZATION_ID = "b00b0000-0000-4000-8000-000000000001";
const CLIENT_SLUG = "boombox";
const CORE_URL = "https://connect.orbitnova.cl";

function sqlRows(cwd, sql) {
  const output = execFileSync("/usr/bin/env", ["npx", "supabase", "db", "query", "--linked", "--output-format", "json", sql], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(output.slice(output.indexOf("{"))).rows;
}

function executeSql(cwd, sql) {
  execFileSync("/usr/bin/env", ["npx", "supabase", "db", "query", "--linked", sql], { cwd, stdio: ["ignore", "ignore", "ignore"] });
}

function literal(value) {
  if (value == null) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function googleJson(url, token, init = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

function sameCalendarMoment(left, right) {
  if (!left || !right) return false;
  if (left.date || right.date) return left.date === right.date;
  const leftTime = Date.parse(left.dateTime ?? "");
  const rightTime = Date.parse(right.dateTime ?? "");
  return Number.isFinite(leftTime) && leftTime === rightTime;
}

async function main() {
  const clientToken = process.env.ORBIT_CONNECT_CLIENT_TOKEN;
  if (!clientToken) throw new Error("ORBIT_CONNECT_CLIENT_TOKEN is required");
  const tenantHeaders = { "x-orbit-client-token": clientToken };
  const params = `organization_id=${encodeURIComponent(ORGANIZATION_ID)}&client_slug=${encodeURIComponent(CLIENT_SLUG)}`;
  const [healthResponse, tokenResponse] = await Promise.all([
    fetch(`${CORE_URL}/api/integrations/google/health?${params}`, { headers: tenantHeaders }),
    fetch(`${CORE_URL}/api/integrations/google/access-token?${params}`, { headers: tenantHeaders }),
  ]);
  const health = await healthResponse.json();
  const tokenBody = await tokenResponse.json();
  if (!healthResponse.ok || !tokenResponse.ok || health.health !== "HEALTHY" || !tokenBody.access_token) throw new Error("NOVA Google connection is not healthy");
  if (!health.provider_config?.calendar_id) throw new Error("NOVA calendar is missing");
  const novaToken = tokenBody.access_token;
  const novaCalendarId = health.provider_config.calendar_id;

  const legacy = sqlRows(APP_DIR, "select access_token,token_expires_at from public.google_workspace_connections where singleton_key='PRIMARY' and connection_status='CONNECTED'")[0];
  if (!legacy?.access_token) throw new Error("Legacy access token unavailable");
  const legacyTokenCheck = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(legacy.access_token)}`);
  if (!legacyTokenCheck.ok) throw new Error("Legacy access token expired; refresh it before migration");

  const root = sqlRows(APP_DIR, "select ds.external_folder_id,cs.drive_root_folder,count(*)::int refs from public.drive_sync ds cross join public.company_settings cs where cs.settings_key='PRIMARY' and ds.destination_key=cs.drive_root_folder and ds.external_folder_id is not null group by ds.external_folder_id,cs.drive_root_folder order by refs desc limit 1")[0];
  if (!root?.external_folder_id) throw new Error("Canonical BOOMBOX Drive root was not found");
  const rootCheck = await googleJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(root.external_folder_id)}?fields=id,name,mimeType,trashed`, novaToken);
  if (!rootCheck.ok || rootCheck.body?.trashed || rootCheck.body?.name !== root.drive_root_folder) throw new Error("Canonical BOOMBOX Drive root is not accessible through NOVA");
  executeSql(CORE_DIR, `update public.organization_integrations set drive_root_folder_id=${literal(root.external_folder_id)}, metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reconciled_legacy_drive_root_id',${literal(root.external_folder_id)},'reconciled_legacy_drive_root_name',${literal(root.drive_root_folder)},'drive_reconciled_at',now()), updated_at=now() where organization_id=${literal(ORGANIZATION_ID)} and provider='google'`);

  const rows = sqlRows(APP_DIR, "select cs.id,cs.project_id,cs.orbit_event_id,cs.status,cs.external_event_id,cs.nova_external_event_id,p.deleted_at from public.calendar_sync cs join public.projects p on p.id=cs.project_id order by cs.created_at,cs.id");
  const updates = [];
  let migrated = 0;
  let reused = 0;
  let skippedDeleted = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.status === "DELETED" || row.deleted_at) {
      updates.push(`update public.calendar_sync set nova_calendar_id=${literal(novaCalendarId)},nova_migration_status='SKIPPED_DELETED',nova_migrated_at=now(),nova_migration_error=null where id=${literal(row.id)}::uuid`);
      skippedDeleted += 1;
      continue;
    }
    try {
      let target = null;
      if (row.nova_external_event_id) {
        const existing = await googleJson(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(novaCalendarId)}/events/${encodeURIComponent(row.nova_external_event_id)}`, novaToken);
        if (existing.ok) target = existing.body;
      }
      if (!target) {
        const search = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(novaCalendarId)}/events`);
        search.searchParams.set("privateExtendedProperty", `orbitProjectId=${row.project_id}`);
        search.searchParams.set("maxResults", "2");
        search.searchParams.set("showDeleted", "false");
        const found = await googleJson(search, novaToken);
        if (!found.ok) throw new Error(`NOVA calendar lookup ${found.status}`);
        if ((found.body?.items?.length ?? 0) > 1) throw new Error("Multiple NOVA events found for one project");
        target = found.body?.items?.[0] ?? null;
        if (target) reused += 1;
      }
      const source = await googleJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(row.external_event_id)}`, legacy.access_token);
      if (!source.ok) throw new Error(`Legacy event unavailable ${source.status}`);
      if (!target) {
        const sourcePrivate = source.body?.extendedProperties?.private ?? {};
        const payload = {
          summary: source.body?.summary,
          description: source.body?.description,
          location: source.body?.location,
          colorId: source.body?.colorId,
          start: source.body?.start,
          end: source.body?.end,
          transparency: source.body?.transparency,
          visibility: source.body?.visibility,
          extendedProperties: { private: { ...sourcePrivate, orbitProjectId: row.project_id, orbitEventId: row.orbit_event_id, legacyEventId: row.external_event_id } },
        };
        const createUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(novaCalendarId)}/events`);
        createUrl.searchParams.set("sendUpdates", "none");
        const created = await googleJson(createUrl, novaToken, { method: "POST", body: JSON.stringify(payload) });
        if (!created.ok) throw new Error(`NOVA calendar create ${created.status}`);
        target = created.body;
      }
      const datesMatch = sameCalendarMoment(target?.start, source.body?.start) && sameCalendarMoment(target?.end, source.body?.end);
      if (!target?.id || !datesMatch) throw new Error("NOVA calendar validation mismatch");
      updates.push(`update public.calendar_sync set nova_external_event_id=${literal(target.id)},nova_external_url=${literal(target.htmlLink)},nova_calendar_id=${literal(novaCalendarId)},nova_migration_status='MIGRATED',nova_migrated_at=now(),nova_migration_error=null where id=${literal(row.id)}::uuid`);
      migrated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 180) : "Unknown migration error";
      updates.push(`update public.calendar_sync set nova_calendar_id=${literal(novaCalendarId)},nova_migration_status='ERROR',nova_migration_error=jsonb_build_object('message',${literal(message)}),nova_migrated_at=null where id=${literal(row.id)}::uuid`);
      failed += 1;
    }
  }
  executeSql(APP_DIR, `begin;${updates.join(";")};commit;`);
  console.log(JSON.stringify({ driveRootReused: true, calendarTotal: rows.length, migrated, reused, skippedDeleted, failed, primaryEventsDeleted: 0 }));
  if (failed) process.exitCode = 2;
}

await main();
