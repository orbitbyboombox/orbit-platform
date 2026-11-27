import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const viewer = fs.readFileSync("features/commercial-hub/quote-pdf-viewer-page.tsx", "utf8");
const sharedViewer = fs.readFileSync("features/document-viewer/pdf-viewer.tsx", "utf8");
const detail = fs.readFileSync("features/commercial-hub/quote-detail-experience.tsx", "utf8");
const conversion = fs.readFileSync("features/commercial-hub/quote-conversion-review.tsx", "utf8");
const search = fs.readFileSync("features/global-search/model.ts", "utf8");

test("quote PDF viewer has an exact return target and a separate canonical download", () => {
  assert.match(viewer, /const id = encodeURIComponent\(quoteId\)/);
  assert.match(viewer, /const src = `\/api\/commercial\/quotes\/\$\{id\}\/pdf`/);
  assert.match(viewer, /<PdfViewer[^>]*src=\{src\} download=\{`\$\{src\}\?download=1`\} fallback=\{`\/quotes\/\$\{id\}`\}/);
  assert.match(sharedViewer, /referrer\?\.origin === window\.location\.origin && window\.history\.length > 1\) router\.back\(\)/);
  assert.match(sharedViewer, /else router\.replace\(fallback\)/);
  assert.match(sharedViewer, /href=\{download\} download>Descargar/);
});

test("quote entry points open the navigable viewer instead of the raw API", () => {
  assert.match(detail, /href=\{`\/quotes\/\$\{quote\.id\}\/pdf`\}/);
  assert.match(conversion, /href=\{`\/quotes\/\$\{review\.quoteId\}\/pdf`\}/);
  assert.match(search, /return `\/quotes\/\$\{id\}`/);
});
