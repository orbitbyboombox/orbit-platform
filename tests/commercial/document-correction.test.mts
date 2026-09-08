import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const documentSource = readFileSync("features/commercial-hub/formal-quote-document.ts", "utf8");
const actionSource = readFileSync("features/projects/actions/customer.actions.ts", "utf8");
const uiSource = readFileSync("features/projects/signing/agreement-signing-control.tsx", "utf8");

test("commercial correction preserves history and creates a new current version", () => {
  assert.match(documentSource, /regenerateCommercialDocument/);
  assert.match(documentSource, /is_current: false/);
  assert.match(documentSource, /is_current: true/);
  assert.match(documentSource, /DOCUMENT_CORRECTION/);
  assert.match(documentSource, /previousDocumentId/);
  assert.match(documentSource, /upsert: false/);
});

test("signed agreements remain protected and are never regenerated", () => {
  assert.match(documentSource, /agreement\.status === "SIGNED"/);
  assert.match(documentSource, /no puede regenerarse/);
});

test("resend prefers current commercial document and correction never sends email", () => {
  assert.match(documentSource, /is_current.*true/);
  assert.match(actionSource, /regenerateCommercialDocument\(/);
  assert.match(uiSource, /Regenerar documento corregido/);
  assert.match(uiSource, /no se enviará ningún correo/);
});
