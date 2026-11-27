import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("supabase/migrations/20260928190000_quote_negotiation_reason_post_send.sql", "utf8");
const ui = readFileSync("features/commercial-hub/commercial-hub.tsx", "utf8");
const actions = readFileSync("features/commercial-hub/actions.ts", "utf8");

test("negotiated post-send edits require and persist a reason", () => {
  assert.match(sql, /grand_total_value<>coalesce\(q\.official_price,grand_total_value\) and reason_value is null/);
  assert.match(sql, /negotiation_reason=case when q\.status<>'DRAFT'/);
  assert.match(sql, /last_change_reason=case when q\.status<>'DRAFT'/);
  assert.match(sql, /change_reason=reason_value/);
});

test("same-price edits remain optional while negotiated edits are required in UI", () => {
  assert.match(ui, /priceDiffersFromOfficial = initialDraft\?\.officialPrice != null && Math\.abs\(totals\.total - initialDraft\.officialPrice\) >= 1/);
  assert.match(ui, /showChangeReason = Boolean\(persistedQuoteId\) && \(priceDiffersFromOfficial \|\| requiresChangeReason\)/);
  assert.match(ui, /required=\{showChangeReason\}/);
  assert.match(ui, /Motivo de negociación \(obligatorio para cambiar el precio\)/);
});

test("negotiated edits block the save button and preserve the database validation message", () => {
  assert.match(ui, /if \(showChangeReason && !changeReason\.trim\(\)\)/);
  assert.match(ui, /Para modificar el precio de una cotización enviada, indica el motivo de negociación/);
  assert.match(ui, /changeReasonRef\.current\?\.focus/);
  assert.match(actions, /technical\?\.code === "22023"/);
  assert.match(actions, /El precio difiere del precio oficial\. Ingresa un motivo de negociación para guardar el cambio\./);
});
