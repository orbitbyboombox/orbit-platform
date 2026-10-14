import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validatePaperTransferRequest } from "../features/resources/paper-transfer-policy.ts";

const warehouse = readFileSync("features/resources/warehouse-inventory.tsx", "utf8");
const boxes = readFileSync("app/(platform)/resources/boxes/page.tsx", "utf8");
const workspace = readFileSync("features/projects/components/project-workspace-experience.tsx", "utf8");
const proposal = readFileSync("supabase/proposals/issue-73-paper-transfer-rpc-proposal.sql", "utf8");

test("Issue 73 exposes warehouse history and real stock without enabling writes", () => {
  assert.match(warehouse, /data-issue73-warehouse-stock/);
  assert.match(warehouse, /Historial de compras e ingresos documentados/);
  assert.match(warehouse, /Movimientos auditables/);
  assert.match(warehouse, /Transferencia aún no habilitada/);
  assert.doesNotMatch(warehouse, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(boxes, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("Issue 73 transfer policy rejects unsafe requests before any RPC exists", () => {
  assert.deepEqual(validatePaperTransferRequest({ sourceStock: 20, requestedQuantity: 21, destinationBoxId: "CASE-01", sourceLotId: "LOT-1", idempotencyKey: "transfer-1" }), ["INSUFFICIENT_SOURCE_STOCK"]);
  assert.deepEqual(validatePaperTransferRequest({ sourceStock: 20, requestedQuantity: 0, destinationBoxId: "", sourceLotId: "", idempotencyKey: "" }), ["DESTINATION_BOX_REQUIRED", "SOURCE_LOT_REQUIRED", "IDEMPOTENCY_KEY_REQUIRED", "QUANTITY_MUST_BE_POSITIVE"]);
  assert.deepEqual(validatePaperTransferRequest({ sourceStock: 20, requestedQuantity: 20, destinationBoxId: "CASE-01", sourceLotId: "LOT-1", idempotencyKey: "transfer-1" }), []);
});

test("Issue 73 keeps the transfer SQL explicitly non-production", () => {
  assert.match(proposal, /DRAFT ONLY \/ DO NOT APPLY/);
  assert.match(proposal, /idempotency_key/);
  assert.match(proposal, /atomically or roll back/);
  assert.match(proposal, /RLS/);
  assert.doesNotMatch(proposal, /create\s+(or replace\s+)?function/i);
});

test("Issue 73 improves desktop documents layout and preserves canonical Staff routes", () => {
  assert.match(workspace, /data-issue73-documents-layout/);
  assert.match(workspace, /data-issue73-documents-designs/);
  assert.match(workspace, /data-issue73-documents-commercial/);
  assert.match(workspace, /\@\[48rem\]:grid-cols-\[minmax\(0,1\.05fr\)_minmax\(20rem,\.95fr\)\]/);
  assert.match(workspace, /data-issue73-staff-finance-links/);
  assert.match(workspace, /href="\/finance\/payables"/);
  assert.match(workspace, /href="\/resources\/staff\?payroll=1"/);
});

