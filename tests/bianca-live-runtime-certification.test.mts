import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  BIANCA_RUNTIME_VERSION,
  createBiancaLiveRuntimeCertification,
  finalizeBiancaLiveRuntimeCertification,
  getBiancaLiveRuntimeSummary,
  markBiancaLiveRuntimeDelivered,
  markBiancaLiveRuntimeMetaSent,
  markStalledBiancaRuntimeOutboxes,
  updateBiancaLiveRuntimeCertification,
} from "../features/connectors/whatsapp-cloud/bianca-live-runtime-certification.ts";

type Row = Record<string, unknown>;

class CertificationDbMock {
  rows = new Map<string, Row>();
  outboxRpcCalls = 0;

  from(table: string) {
    const state = { table, payload: null as Row | null, filters: [] as Array<[string, unknown]> };
    const builder = {
      upsert: (payload: Row) => { state.payload = payload; return builder; },
      update: (payload: Row) => { state.payload = payload; return builder; },
      select: () => builder,
      single: async () => {
        const key = String(state.payload?.provider_message_id ?? "");
        const existing = this.rows.get(key) ?? {};
        this.rows.set(key, { ...existing, ...state.payload, id: existing.id ?? `cert-${key}` });
        return { data: { id: this.rows.get(key)?.id }, error: null };
      },
      eq: (key: string, value: unknown) => { state.filters.push([key, value]); return builder; },
      not: () => builder,
      gte: () => builder,
      then: (resolve: (value: unknown) => unknown) => {
        const provider = state.filters.find(([key]) => key === "provider_message_id")?.[1];
        if (state.table === "bianca_live_runtime_certifications" && state.payload) {
          const key = String(provider ?? state.payload.provider_message_id ?? "");
          const existing = this.rows.get(key) ?? {};
          this.rows.set(key, { ...existing, ...state.payload, id: existing.id ?? `cert-${key}` });
        }
        const data = state.table === "bianca_live_runtime_certifications" && state.filters.length === 0 ? [...this.rows.values()] : null;
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return builder;
  }

  rpc() {
    this.outboxRpcCalls += 1;
    return Promise.resolve({ data: 2, error: null });
  }
}

test("migration closes the live certification schema and contract invariant", () => {
  const sql = readFileSync("supabase/migrations/20260921170000_bianca_live_runtime_certification.sql", "utf8");
  assert.match(sql, /create table if not exists public\.bianca_live_runtime_certifications/);
  assert.match(sql, /unique \(tenant_slug, provider_message_id\)/);
  assert.match(sql, /final_contract_state text check \(final_contract_state in \('RESPONSE_SENT','WAITING_HUMAN','INTENTIONALLY_SILENT','FAILED'\)\)/);
  assert.match(sql, /bianca_mark_stalled_runtime_outboxes/);
  assert.match(sql, /last_error = 'DELIVERY_STALLED'/);
});

test("normal response, handoff, intentional silence and failure are persisted explicitly", async () => {
  const db = new CertificationDbMock();
  for (const providerMessageId of ["normal", "handoff", "silent", "failed"]) {
    await createBiancaLiveRuntimeCertification({ client: db as never, providerMessageId, webhookReceivedAt: "2026-09-21T15:00:00.000Z", processingStartedAt: "2026-09-21T15:00:00.010Z" });
  }
  await finalizeBiancaLiveRuntimeCertification({ client: db as never, providerMessageId: "normal", state: "RESPONSE_SENT" });
  await finalizeBiancaLiveRuntimeCertification({ client: db as never, providerMessageId: "handoff", state: "WAITING_HUMAN" });
  await finalizeBiancaLiveRuntimeCertification({ client: db as never, providerMessageId: "silent", state: "INTENTIONALLY_SILENT" });
  await finalizeBiancaLiveRuntimeCertification({ client: db as never, providerMessageId: "failed", state: "FAILED", failureCode: "META_REJECTED", failureDetail: "provider rejected" });
  assert.deepEqual([...db.rows.values()].map((row) => row.final_contract_state).sort(), ["FAILED", "INTENTIONALLY_SILENT", "RESPONSE_SENT", "WAITING_HUMAN"]);
  assert.equal(db.rows.get("failed")?.failure_code, "META_REJECTED");
  assert.equal(db.rows.get("normal")?.runtime_version, BIANCA_RUNTIME_VERSION);
});

test("Meta accepted and delivered timestamps update the inbound certification", async () => {
  const db = new CertificationDbMock();
  await createBiancaLiveRuntimeCertification({ client: db as never, providerMessageId: "delivery", webhookReceivedAt: "2026-09-21T15:00:00.000Z", processingStartedAt: "2026-09-21T15:00:00.010Z" });
  await markBiancaLiveRuntimeMetaSent(db as never, "delivery", "2026-09-21T15:00:01.000Z");
  await markBiancaLiveRuntimeDelivered(db as never, "delivery", "2026-09-21T15:00:02.000Z");
  assert.equal(db.rows.get("delivery")?.meta_sent_at, "2026-09-21T15:00:01.000Z");
  assert.equal(db.rows.get("delivery")?.delivered_at, "2026-09-21T15:00:02.000Z");
});

test("duplicate inbound is idempotent and stalled pending detection is explicit", async () => {
  const db = new CertificationDbMock();
  await createBiancaLiveRuntimeCertification({ client: db as never, providerMessageId: "duplicate", webhookReceivedAt: "2026-09-21T15:00:00.000Z", processingStartedAt: "2026-09-21T15:00:00.010Z" });
  await createBiancaLiveRuntimeCertification({ client: db as never, providerMessageId: "duplicate", webhookReceivedAt: "2026-09-21T15:00:00.000Z", processingStartedAt: "2026-09-21T15:00:00.010Z" });
  assert.equal(db.rows.size, 1);
  assert.equal(await markStalledBiancaRuntimeOutboxes(db as never), 2);
  assert.equal(db.outboxRpcCalls, 1);
});

test("summary returns null latency and rates when there is no live sample", async () => {
  const db = new CertificationDbMock();
  const summary = await getBiancaLiveRuntimeSummary(db as never);
  assert.equal(summary.LIVE_MESSAGES, 0);
  assert.equal(summary.P50_INBOUND_TO_META, null);
  assert.equal(summary.P95_INBOUND_TO_DELIVERED, null);
  assert.equal(summary.META_SEND_SUCCESS_RATE, null);
});

test("PROCESSED is only valid after a non-null final contract state", () => {
  const sql = readFileSync("supabase/migrations/20260921170000_bianca_live_runtime_certification.sql", "utf8");
  assert.match(sql, /final_contract_state text check/);
  assert.match(readFileSync("features/connectors/whatsapp-cloud/whatsapp-orbit.processor.ts", "utf8"), /finalizeBiancaLiveRuntimeCertification/);
});

