import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync("lib/supabase/server.ts", "utf8");
const refresh = readFileSync("lib/supabase/middleware.ts", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");
const actions = readFileSync("features/authentication/actions/auth.actions.ts", "utf8");

test("Supabase auth cookies survive browser and PWA restarts", () => {
  assert.match(server, /maxAge:60\*60\*24\*365/);
  assert.match(server, /path:"\/"/);
  assert.match(server, /sameSite:"lax"/);
  assert.match(server, /secure:process\.env\.NODE_ENV==="production"/);
});

test("the middleware refreshes sessions for the root and login entrypoints", () => {
  assert.match(refresh, /supabase\.auth\.getUser\(\)/);
  assert.match(refresh, /isPublicEntry = request\.nextUrl\.pathname === "\/"/);
  assert.doesNotMatch(middleware, /pathname === "\/".*NextResponse\.next/);
  assert.doesNotMatch(middleware, /pathname === "\/login".*NextResponse\.next/);
});

test("only the explicit sign-out action clears the internal session", () => {
  assert.match(actions, /export async function signOutAction\(\)/);
  assert.match(actions, /await signOut\(\)/);
  assert.doesNotMatch(refresh, /auth\.signOut\(\)/);
});
