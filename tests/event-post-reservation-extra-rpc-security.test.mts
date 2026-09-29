import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260929100000_secure_event_post_reservation_extra_rpc.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("post-reservation extra RPC security", () => {
  it("uses a guarded SECURITY DEFINER without opening table UPDATE", () => {
    assert.match(migration, /security definer/i);
    assert.match(migration, /set search_path\s*=\s*public/i);
    assert.match(migration, /actor\s+uuid\s*:=\s*auth\.uid\(\)/i);
    assert.match(migration, /actor\s+is\s+null\s+or\s+not\s+public\.can_administer\(\)/i);
    assert.match(migration, /revoke all on function[\s\S]*from public, anon/i);
    assert.match(migration, /grant execute on function[\s\S]*to authenticated, service_role/i);
    assert.doesNotMatch(migration, /grant\s+update[\s\S]*financial_event_records/i);
  });
});
