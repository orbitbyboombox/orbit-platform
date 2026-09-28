import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const boletaAction = source("features/staff-monthly-account/actions.ts");
const quoteUi = source("features/commercial-hub/commercial-hub.tsx");
const quoteMigration = source("supabase/migrations/20260928190000_quote_negotiation_reason_post_send.sql");
const emailTemplate = source("features/connectors/google-gmail/application/reservation-confirmation.template.ts");

test("staff boleta admin action calls the canonical RPC and reads back success", () => {
  assert.match(boletaAction, /rpc\("review_staff_monthly_boleta"/);
  assert.match(boletaAction, /staff_boleta_review_status_transition_ok/);
  assert.match(boletaAction, /staff_boleta_review_alert_resolved/);
  assert.doesNotMatch(boletaAction, /staff_monthly_blocking_events/);
});

test("sent quote price changes require and persist negotiation reason", () => {
  assert.match(quoteUi, /required=\{negotiatedPostSend\}/);
  assert.match(quoteUi, /changeReason/);
  assert.match(quoteMigration, /negotiation_reason=case when q\.status<>'DRAFT'/);
  assert.match(quoteMigration, /change_reason=reason_value/);
});

test("reservation confirmation explicitly hides individual extra prices", () => {
  assert.match(emailTemplate, /includeExtraPrices: false/);
});
