import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const sql = readFileSync(`${root}/supabase/migrations/0157_quotation_global_sequence.sql`, "utf8");
const commercial = readFileSync(`${root}/features/commercial-hub/actions.ts`, "utf8");
const automatic = readFileSync(`${root}/features/automatic-booking/complete-automatic-booking.service.ts`, "utf8");
const reservation = readFileSync(`${root}/features/projects/actions/customer.actions.ts`, "utf8");
const repository = readFileSync(`${root}/features/quotation-engine/supabase-quotation.repository.ts`, "utf8");

test("0157 seeds the perpetual global counter at exactly 820", () => {
  assert.match(sql, /values \('GLOBAL', 820\)/);
  assert.match(sql, /set next_value = v_sequence \+ 1/);
  assert.doesNotMatch(sql, /max\s*\([^)]*quotation/i);
  assert.doesNotMatch(sql, /quote_year.*primary key/);
});

test("allocator is concurrent-safe and idempotent by quotation id", () => {
  assert.match(sql, /quotation_id uuid primary key/);
  assert.match(sql, /sequence_value bigint not null unique/);
  assert.match(sql, /for update;/);
  assert.match(sql, /where a\.quotation_id = p_quotation_id/);
  assert.match(sql, /when unique_violation/);
});

test("canonical format uses issue year and never resets sequence", () => {
  assert.match(sql, /current_timestamp at time zone 'America\/Santiago'/);
  assert.match(sql, /v_year::text \|\| '-' \|\| v_sequence::text/);
  assert.match(sql, /quotation_number = issue_year::text \|\| '-' \|\| sequence_value::text/);
  assert.doesNotMatch(sql, /lpad/i);
});

test("migration preserves history and guards Founder seed", () => {
  assert.match(sql, /split_part\(q\.quotation_number, '-', 2\)::bigint >= 820/);
  assert.doesNotMatch(sql, /update\s+public\.quotations/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.quotations/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.quotations/i);
  assert.match(sql, /before insert on public\.quotations/);
});

test("all application quotation writers use the canonical allocator", () => {
  for (const source of [commercial, automatic, reservation, repository]) {
    assert.match(source, /allocate_quotation_number/);
    assert.doesNotMatch(source, /COT-AUTO-|COT-\$\{|next_commercial_quote_number/);
  }
  assert.match(commercial, /America\/Santiago/);
  assert.match(automatic, /America\/Santiago/);
  assert.match(reservation, /America\/Santiago/);
});

test("edits preserve the assigned quotation number and outputs consume it", () => {
  assert.match(commercial, /select\("quotation_number,status"\)/);
  assert.match(commercial, /number = existing\.quotation_number/);
  assert.match(commercial, /createFormalQuotePdf\(\{ number: quote\.quotation_number/);
  assert.match(repository, /select\("id,quotation_number"\)/);
  assert.match(automatic, /rendered_contract: \{ quotationNumber/);
});
