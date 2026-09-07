import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const center = readFileSync("features/staff-onboarding/staff-onboarding-center.tsx", "utf8");
const actions = readFileSync("features/staff-onboarding/staff-onboarding.actions.ts", "utf8");
const migration = readFileSync("supabase/migrations/0235_staff_invitation_resend_observability.sql", "utf8");

test("resend is eligible only for open onboarding states and never approved", () => {
  assert.match(center, /INVITED.*OPENED.*CHANGES_REQUESTED.*SUBMITTED/);
  assert.match(center, /item\.status!=="APPROVED"/);
  assert.match(actions, /Esta invitación no está disponible para reenvío/);
});
test("resend uses canonical MobileDialog and no native confirmation", () => {
  assert.match(center, /<MobileDialog/);
  assert.match(center, /REENVIAR INVITACIÓN/);
  const resendDialog = center.slice(center.indexOf("function ResendDialog"), center.indexOf("const label"));
  assert.doesNotMatch(resendDialog, /window\.confirm/);
});
test("resend has loading, terminal feedback and preserves list context", () => {
  assert.match(center, /REENVIANDO…/);
  assert.match(actions, /Invitación reenviada/);
  assert.match(center, /router\.refresh\(\)/);
});
test("token rotation and provider idempotency are persisted without token logging", () => {
  assert.match(actions, /token_hash:hash\(token\)/);
  assert.match(actions, /idempotencyKey/);
  assert.match(actions, /last_resend_provider_message_id/);
  assert.doesNotMatch(actions, /event:"staff_invitation_resend_(?:start|token_ready|provider_start|provider_success|complete|failed)"[^\n]*token/);
  assert.match(migration, /last_resend_request_id/);
  assert.match(migration, /last_resend_provider_message_id/);
});
test("resend audit has a deterministic correlation id and no duplicate candidate creation", () => {
  assert.match(actions, /staff-invitation-resend:/);
  assert.match(actions, /INVITATION_RESENT/);
  assert.doesNotMatch(actions, /insert\(\{[^}]*staff_onboarding_invitations/);
});
