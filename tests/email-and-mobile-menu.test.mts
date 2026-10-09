import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeBoomBoxEmailHtml } from "../features/connectors/google-gmail/provider/google-gmail-live.provider.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("outgoing simple email HTML gets explicit Gmail/Outlook-safe colors", () => {
  const html = normalizeBoomBoxEmailHtml("<main><h1>Hola</h1><p>Contenido</p></main>");
  assert.match(html, /bgcolor="#0b0c0e"/);
  assert.match(html, /background-color:#0b0c0e/);
  assert.match(html, /color:#ffffff/);
  assert.match(html, /color-scheme/);
  assert.match(html, /supported-color-schemes/);
});

test("existing BOOMBOX email shell keeps its structure and receives compatibility metadata", () => {
  const html = normalizeBoomBoxEmailHtml("<!doctype html><html><head><meta charset=\"utf-8\"></head><body style=\"margin:0\"><table><tr><td>Contenido</td></tr></table></body></html>");
  assert.equal((html.match(/<html/gi) ?? []).length, 1);
  assert.match(html, /supported-color-schemes/);
  assert.match(html, /bgcolor="#ece9e3"/);
  assert.match(html, /background-color:#ece9e3/);
});

test("mobile navigation closes, traps background scroll, and supports repeated navigation", () => {
  const source = read("components/layout/header.tsx");
  assert.match(source, /setMenuOpen\(false\)/);
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /Cerrar navegación/);
  assert.match(source, /overscroll-contain/);
  assert.match(source, /onNavigate=\{\(\) => setMenuOpen\(false\)\}/);
});

