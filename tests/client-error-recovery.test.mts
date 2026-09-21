import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const middleware = fs.readFileSync("middleware.ts", "utf8");
const boundary = fs.readFileSync("app/error.tsx", "utf8");
const globalBoundary = fs.readFileSync("app/global-error.tsx", "utf8");
const telemetry = fs.readFileSync("app/api/client-errors/route.ts", "utf8");
const reservationDrawer = fs.readFileSync("features/projects/components/new-project-drawer.tsx", "utf8");

test("resilient sync service worker is public and not redirected to auth", () => {
  assert.match(middleware, /orbit-resilient-sync-sw\.js/);
  assert.match(middleware, /api\/client-errors/);
});

test("error boundaries report sanitized telemetry and offer recovery", () => {
  assert.match(boundary, /ChunkLoadError|Loading chunk failed/);
  assert.match(boundary, /orbit-chunk-recovery/);
  assert.match(boundary, /Reintentar/);
  assert.match(boundary, /Volver al escritorio/);
  assert.match(globalBoundary, /ORBIT encontró un problema/);
  assert.match(telemetry, /client\.exception/);
  assert.doesNotMatch(telemetry, /Authorization|access_token|password/);
  assert.match(reservationDrawer, /localStorage\.getItem\(manualReservationDraftKey\)/);
  assert.match(reservationDrawer, /try \{ saved = window\.localStorage/);
});
