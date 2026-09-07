import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Founder-visible BIANCA surfaces do not expose the legacy identity", async () => {
  const files = [
    "features/communication-hub/components/whatsapp-inbox.tsx",
    "features/communication-hub/components/communication-hub.tsx",
    "features/founder-workspace/founder-workspace-experience.tsx",
    "features/dashboard/components/home-experience.tsx",
    "features/bianca-lab/bianca-lab.tsx",
    "features/bianca-workspace/bianca-workspace.tsx",
  ];
  const sources = await Promise.all(files.map(read));
  assert.equal(sources.some((source) => /NOVA/.test(source)), false);
});

test("legacy persisted identifiers remain compatibility-only while new timeline actors are BIANCA", async () => {
  const timeline = await read("features/communication-hub/timeline/supabase-communication.timeline.ts");
  const actions = await read("features/communication-hub/actions.ts");
  assert.match(timeline, /actorLabel: .*BIANCA/);
  assert.match(timeline, /type: .*NOVA_RESPONSE/);
  assert.doesNotMatch(actions, /NOVA pausada|devuelta a NOVA|NOVA reactivada/);
});

test("delivery gates remain fail-closed", async () => {
  const policy = await read("features/connectors/whatsapp-cloud/bianca-policy.ts");
  const transport = await read("features/connectors/whatsapp-cloud/meta-whatsapp-cloud.ts");
  assert.match(policy, /=== "true"/);
  assert.match(transport, /WHATSAPP_DELIVERY_ENABLED/);
});
