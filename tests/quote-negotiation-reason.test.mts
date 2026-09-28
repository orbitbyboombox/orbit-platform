import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("supabase/migrations/20260928190000_quote_negotiation_reason_post_send.sql", "utf8");
const ui = readFileSync("features/commercial-hub/commercial-hub.tsx", "utf8");

test("negotiated post-send edits require and persist a reason", () => {
  assert.match(sql, /grand_total_value<>coalesce\(q\.official_price,grand_total_value\) and reason_value is null/);
  assert.match(sql, /negotiation_reason=case when q\.status<>'DRAFT'/);
  assert.match(sql, /last_change_reason=case when q\.status<>'DRAFT'/);
  assert.match(sql, /change_reason=reason_value/);
});

test("same-price edits remain optional while negotiated edits are required in UI", () => {
  assert.match(ui, /negotiatedPostSend/);
  assert.match(ui, /required=\{negotiatedPostSend\}/);
  assert.match(ui, /Motivo del cambio \/ negociación \(obligatorio\)/);
});
