import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSocialPlansEmail } from "../features/commercial-hub/social-plans-email.ts";
import { OFFICIAL_BOOMBOX_LOGO_URL } from "../features/connectors/google-gmail/application/boombox-commercial-email.html.ts";
import { quickSendInitialBody } from "../features/commercial-hub/presentation.ts";

const actions = readFileSync("features/commercial-hub/actions.ts", "utf8");

test("commercial renderer uses the verified official BOOMBOX image and keeps both CTAs separate", () => {
  const rendered = buildSocialPlansEmail({
    body: quickSendInitialBody("WEDDINGS", ""),
    contact: "Cliente",
    website: "https://www.bbox.cl",
    catalogUrl: "https://orbit.boom-box.cl/catalogo/novios",
    transportUrl: "https://app.bbox.cl/traslados?type=private",
  }).html;
  assert.match(rendered, new RegExp(OFFICIAL_BOOMBOX_LOGO_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(rendered, /alt="BOOMBOX®"/);
  assert.match(rendered, /href="https:\/\/orbit\.boom-box\.cl\/catalogo\/novios\/document"[^>]*>VER COTIZACIÓN PDF</);
  assert.match(rendered, />CONOCER VALOR DE TRASLADO</);
  assert.equal((rendered.match(/boombox-official-logo\.png/g) ?? []).length, 1);
  assert.match(rendered, /href="https:\/\/app\.bbox\.cl\/traslados\?type=private"/);
});

test("category-specific commercial copy remains selective and does not change delivery controls", () => {
  assert.match(quickSendInitialBody("WEDDINGS", ""), /tu matrimonio/);
  assert.match(quickSendInitialBody("BIRTHDAYS", ""), /tu cumpleaños/);
  assert.match(quickSendInitialBody("GRADUATIONS", ""), /tu evento/);
  assert.match(quickSendInitialBody("COMPANIES_CATALOG", ""), /empresas, marcas y agencias/);
  assert.match(actions, /GMAIL_ACCEPTED|GMAIL_ACCEPTED/);
  assert.match(actions, /idempotency_key: input\.requestId/);
});

test("public transport route remains read-only and unauthenticated", () => {
  const page = readFileSync("app/traslados/page.tsx", "utf8");
  const lookup = readFileSync("app/traslados/transport-value-lookup.tsx", "utf8");
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /loadActiveMunicipalities/);
  assert.match(lookup, /onChange/);
  assert.doesNotMatch(lookup, /insert\(|update\(|delete\(/);
});
