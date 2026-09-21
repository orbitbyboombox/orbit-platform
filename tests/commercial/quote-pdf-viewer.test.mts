import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const viewer = fs.readFileSync("features/commercial-hub/quote-pdf-viewer-page.tsx", "utf8");
const detail = fs.readFileSync("features/commercial-hub/quote-detail-experience.tsx", "utf8");
const conversion = fs.readFileSync("features/commercial-hub/quote-conversion-review.tsx", "utf8");
const search = fs.readFileSync("features/global-search/model.ts", "utf8");

test("quote PDF viewer has an exact return target and a separate canonical download", () => {
  assert.match(viewer, /const detailHref = `\/quotes\/\$\{encodeURIComponent\(quoteId\)\}`/);
  assert.match(viewer, /const pdfHref = `\/api\/commercial\/quotes\/\$\{encodeURIComponent\(quoteId\)\}\/pdf`/);
  assert.match(viewer, /VOLVER A LA COTIZACIÓN/);
  assert.match(viewer, /downloadHref/);
  assert.match(viewer, /router\.back\(\)/);
  assert.match(viewer, /router\.push\(detailHref\)/);
});

test("quote entry points open the navigable viewer instead of the raw API", () => {
  assert.match(detail, /href=\{`\/quotes\/\$\{quote\.id\}\/pdf`\}/);
  assert.match(conversion, /href=\{`\/quotes\/\$\{review\.quoteId\}\/pdf`\}/);
  assert.match(search, /return `\/quotes\/\$\{id\}`/);
});
