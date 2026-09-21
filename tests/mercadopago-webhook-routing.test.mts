import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("only the Mercado Pago webhook is bypassed by middleware", async () => {
  const source = await readFile(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.match(source, /pathname === "\/api\/payments\/mercadopago\/webhook"/);
  assert.doesNotMatch(source, /pathname === "\/api\/payments"/);
  assert.doesNotMatch(source, /pathname\.startsWith\("\/api\/payments"\)/);
  assert.match(source, /pathname === "\/api\/integrations\/whatsapp\/webhook"/);
});
