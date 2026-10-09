import assert from "node:assert/strict";
import test from "node:test";
import { mergeFollowUpIds, normalizeFollowUpIds } from "../features/accounts-receivable/follow-up-sync.ts";

const invoice = (id: string, projectId: string) => ({ id, projectId }) as never;

test("reconciles legacy invoice markers to stable project identifiers", () => {
  assert.deepEqual(normalizeFollowUpIds(["invoice-1", "project-2", "invoice-1"], [invoice("invoice-1", "project-1")]), ["project-1", "project-2"]);
});

test("merges remote and local markers idempotently", () => {
  assert.deepEqual(mergeFollowUpIds(["project-2", "project-1"], ["project-1", "project-3"]), ["project-1", "project-2", "project-3"]);
});
