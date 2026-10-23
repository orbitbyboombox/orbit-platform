import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("transport lookup is wired to the live commercial route and preserves company/private pricing", async () => {
  const page = await readFile("app/traslados/page.tsx", "utf8");
  const lookup = await readFile("app/traslados/transport-value-lookup.tsx", "utf8");
  assert.match(page, /loadActiveMunicipalities/);
  assert.match(page, /params\.type === "company"/);
  assert.match(lookup, /Total con IVA/);
  assert.match(lookup, /Math\.round\(base \* 0\.19\)/);
  assert.match(lookup, /Valor por confirmar/);
});

test("commercial catalog emails expose a separate transport action without changing the catalog action", async () => {
  const email = await readFile("features/commercial-hub/social-plans-email.ts", "utf8");
  const actions = await readFile("features/commercial-hub/actions.ts", "utf8");
  assert.match(email, /transportUrl\?: string/);
  assert.match(email, /secondaryAction: input\.transportUrl/);
  assert.match(email, /CONOCER VALOR DE TRASLADO/);
  assert.match(actions, /\/traslados\?type=/);
  assert.match(actions, /secondaryAction: \{ href: transportUrl, label: transportLabel \}/);
  assert.match(actions, /transportLabel/);
});
