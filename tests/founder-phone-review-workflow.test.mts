import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260925220000_founder_phone_review_workflow.sql", import.meta.url), "utf8");
const action = readFileSync(new URL("../features/crm/actions.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/(platform)/customers/phone-review/page.tsx", import.meta.url), "utf8");
const center = readFileSync(new URL("../features/crm/phone-review-center.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("../features/crm/phone-review-repository.ts", import.meta.url), "utf8");

test("Founder phone review has a dedicated route", () => {
  assert.match(page, /PhoneReviewCenter/);
  assert.match(page, /loadPhoneReviewData/);
});

test("review action is Founder/Admin-only", () => {
  assert.match(action, /reviewCustomerPhoneAction/);
  assert.match(action, /founderClient\(\)/);
});

test("review RPC enforces administrative roles", () => {
  assert.match(migration, /actor_role not in \('CEO', 'ADMINISTRATOR'\)/);
  assert.match(migration, /PHONE_REVIEW_FORBIDDEN/);
});

test("canonical save requires explicit international input", () => {
  assert.match(migration, /public\.normalize_phone_e164\(p_phone\)/);
  assert.match(migration, /PHONE_CANONICAL_REQUIRED/);
  assert.match(action, /Ingresa un teléfono internacional válido con prefijo \+/);
});

test("canonical conflict is blocked without merge", () => {
  assert.match(migration, /PHONE_CANONICAL_CONFLICT/);
  assert.match(action, /Este número ya está asociado a otro cliente/);
  assert.doesNotMatch(migration, /delete from public\.customers/i);
});

test("duplicate groups support keep separate", () => {
  assert.match(center, /KEEP_SEPARATE/);
  assert.match(center, /Mantener separados/);
  assert.match(migration, /'KEEP_SEPARATE'/);
});

test("empty records support explicit no-phone review", () => {
  assert.match(center, /NO_PHONE/);
  assert.match(center, /Marcar sin teléfono/);
  assert.match(migration, /'NO_PHONE'/);
});

test("ambiguous records can remain unresolved", () => {
  assert.match(center, /LEFT_UNRESOLVED/);
  assert.match(center, /Dejar pendiente/);
  assert.match(migration, /'LEFT_UNRESOLVED'/);
});

test("review tabs expose all required categories", () => {
  assert.match(center, /AMBIGUOUS/);
  assert.match(center, /DUPLICATES/);
  assert.match(center, /EMPTY/);
  assert.match(center, /REVIEWED/);
});

test("known duplicate records are grouped without merge", () => {
  assert.match(repository, /duplicateGroup/);
  assert.match(repository, /normalizePhoneE164\(row\.phone\)/);
  assert.match(center, /Todos los clientes se muestran lado a lado/);
});

test("commercial context is visible in review rows", () => {
  assert.match(repository, /projects/);
  assert.match(repository, /quotes/);
  assert.match(repository, /reservations/);
  assert.match(repository, /invoices/);
  assert.match(center, /pagos registrados/);
});

test("review action records old and new phone values in timeline", () => {
  assert.match(migration, /oldPhone/);
  assert.match(migration, /oldPhoneE164/);
  assert.match(migration, /newPhoneE164/);
  assert.match(migration, /CUSTOMER_PHONE_REVIEW/);
});

test("review RPC is not public", () => {
  assert.match(migration, /revoke all on function public\.review_customer_phone/);
  assert.match(migration, /grant execute on function public\.review_customer_phone.*authenticated/);
});

test("review UI blocks duplicate submissions", () => {
  assert.match(center, /useTransition/);
  assert.match(center, /disabled=\{pending\}/);
});

test("review UI remains responsive and does not force country inference", () => {
  assert.match(center, /sm:grid-cols-2/);
  assert.match(center, /No se convertirá automáticamente/);
  assert.match(center, /prefijo internacional completo/);
});
