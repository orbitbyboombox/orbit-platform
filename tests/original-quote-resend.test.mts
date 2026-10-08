import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { originalQuotePdfHref, resolveAcceptedStoredPdf } from "../features/commercial-hub/original-quote-resend-model.ts";

test("Jennifer/Fantasylandia resolves only the accepted stored PDF", () => {
  const stored = resolveAcceptedStoredPdf({
    quoteId: "quote-jennifer",
    projectId: "project-fantasylandia",
    quotationNumber: "2026-999",
    acceptedVersionId: "version-2",
    version: { id: "version-2", quoteId: "quote-jennifer", number: 2, status: "ACCEPTED", acceptedAt: "2026-01-01T00:00:00Z", storagePath: "project-fantasylandia/quote-V2.pdf" },
  });
  assert.equal(stored.version, 2);
  assert.equal(stored.storagePath, "project-fantasylandia/quote-V2.pdf");
  assert.equal(originalQuotePdfHref("quote-jennifer", 2), "/api/commercial/quotes/quote-jennifer/versions/2/pdf");
  assert.equal(originalQuotePdfHref("quote-jennifer", 2, true), "/api/commercial/quotes/quote-jennifer/versions/2/pdf?download=1");
});

test("missing accepted PDF never falls back to current or regenerated data", () => {
  assert.throws(() => resolveAcceptedStoredPdf({ quoteId: "quote-jennifer", projectId: "project-fantasylandia", quotationNumber: "2026-999", acceptedVersionId: "version-2", version: { id: "version-2", quoteId: "quote-jennifer", number: 2, status: "ACCEPTED", acceptedAt: "2026-01-01T00:00:00Z", storagePath: null } }), /PDF original no disponible/);
  assert.throws(() => resolveAcceptedStoredPdf({ quoteId: "quote-jennifer", projectId: "project-fantasylandia", quotationNumber: "2026-999", acceptedVersionId: null, version: null }), /no tiene una versión aceptada/);
});

test("formal resend is isolated from version mutation and PDF regeneration", () => {
  const source = readFileSync(new URL("../features/projects/actions/original-quote-resend.actions.ts", import.meta.url), "utf8");
  const loader = readFileSync(new URL("../features/commercial-hub/original-quote-resend.ts", import.meta.url), "utf8");
  assert.match(source, /FORMAL_QUOTE_RESEND/);
  assert.match(source, /idempotency_key: input\.requestId/);
  assert.match(loader, /quote_versions/);
  assert.doesNotMatch(source, /ensure_current_quote_version/);
  assert.doesNotMatch(source, /regenerateCommercialDocument/);
  assert.doesNotMatch(source, /from\("quotations"\).*update/);
});
