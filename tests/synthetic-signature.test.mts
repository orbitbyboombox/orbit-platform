import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { createSyntheticSignatureDataUrl, decodeSyntheticSignature } from "./fixtures/synthetic-signature.mts";

test("synthetic smoke signature is a real PNG accepted by the PDF parser", async () => {
  const dataUrl = createSyntheticSignatureDataUrl();
  assert.match(dataUrl, /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
  const bytes = decodeSyntheticSignature(dataUrl);
  assert.ok(bytes.length > 200);
  assert.deepEqual(Array.from(bytes.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(bytes);
  assert.equal(image.width, 192);
  assert.equal(image.height, 72);
  await pdf.save();
});
