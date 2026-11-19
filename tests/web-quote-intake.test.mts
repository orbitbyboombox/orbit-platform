import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { acceptWebQuote, normalizeQuote, QuoteError, type QuoteStore } from "../features/web-quotes/intake.ts";
import { sendWebQuoteNotification } from "../features/web-quotes/notification.ts";

const token = "test-only-token-not-a-production-secret-123456";
const payload = (id = "TEST-BOOMBOX-20261119-0001") => ({ solicitudId: id, nombre: "PRUEBA TÉCNICA BOOMBOX — NO CLIENTE", telefono: "+56912345678", correo: "test@example.invalid", tipo: "Matrimonio", paginaOrigen: "matrimonios", fecha: "2026-12-20", servicio: "Classic", horario: "20:00", attribution: { gclid: "TEST-NOT-REAL", utm_campaign: "QA" } });
const request = (x: unknown = payload(), authorization = `Bearer ${token}`) => new Request("https://qa.invalid/api/integrations/boombox/quotes", { method: "POST", headers: { "Content-Type": "application/json", authorization }, body: JSON.stringify(x) });
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create table public.profiles(id uuid primary key,role text);
    grant usage on schema auth to authenticated;
    grant select on public.profiles to authenticated;`);
  await db.exec(readFileSync(new URL("../supabase/migrations/0258_boombox_web_quote_intake.sql", import.meta.url), "utf8"));
  const store: QuoteStore = {
    async persist(q, isTest) {
      try { const r = await db.query<{ result: Awaited<ReturnType<QuoteStore["persist"]>> }>("select public.accept_boombox_web_quote($1::jsonb,$2::boolean) as result", [JSON.stringify(q), isTest]); return r.rows[0].result; }
      catch (e) { if ((e as { code?: string }).code === "23505") throw new QuoteError("REQUEST_ID_CONFLICT", 409); throw e; }
    },
    async claim(id) { const r = await db.query("update public.web_quote_leads set notification_status='SENDING' where solicitud_id=$1 and notification_status='PENDING' returning solicitud_id", [id]); return r.rows.length === 1; },
    async complete(id, state, providerId, errorCode) { await db.query("update public.web_quote_leads set notification_status=$2,notification_provider_id=$3,notification_error_code=$4 where solicitud_id=$1 and notification_status='SENDING'", [id,state,providerId ?? null,errorCode ?? null]); },
  };
  return { db, store };
}

test("unconfigured/authentication/invalid payload paths never persist or send", async () => {
  let calls = 0;
  const store = { persist: async () => { calls++; throw Error(); } } as unknown as QuoteStore;
  const deps = { token, store, isTest: true, emailEnabled: true, notify: async () => { calls++; return { state: "ACCEPTED" as const }; } };
  assert.equal((await acceptWebQuote(request(), { ...deps, token: undefined })).status,503);
  assert.equal((await acceptWebQuote(request(payload(),"Bearer wrong"),deps)).status,401);
  for (const bad of [{}, { ...payload(), telefono: "123" }, { ...payload(), correo: "no" }, { ...payload(), fecha: "2026-02-31" }]) assert.equal((await acceptWebQuote(request(bad), deps)).status,400);
  assert.equal(calls,0);
});
test("SQL migration: concurrent retries persist one lead and send once; attribution survives", async () => {
  const { db, store } = await database(); let sends = 0;
  try {
    const deps = { token, store, isTest: true, emailEnabled: true, notify: async () => { sends++; return { state: "ACCEPTED" as const, providerId: "mock-mail-id" }; } };
    const results = await Promise.all(Array.from({ length: 12 }, () => acceptWebQuote(request(), deps)));
    assert.ok(results.every(r => r.status === 200)); assert.equal(sends,1);
    const rows = (await db.query<{payload: {attribution: unknown}; notification_status: string; is_test: boolean}>("select * from public.web_quote_leads")).rows;
    assert.equal(rows.length,1); assert.equal(rows[0].notification_status,"ACCEPTED"); assert.equal(rows[0].is_test,true);
    assert.deepEqual(rows[0].payload.attribution,normalizeQuote(payload()).attribution);
    for (const r of results) { const body = await r.json(); assert.equal(body.persisted,true); assert.equal(body.conversionEligible,false); }
    const conflict = await acceptWebQuote(request({ ...payload(), mensaje: "different" }), deps);
    assert.equal(conflict.status,409); assert.equal(sends,1);
  } finally { await db.close(); }
});
test("failed and ambiguous email retain the lead; retries never send again", async () => {
  for (const state of ["FAILED", "UNKNOWN"] as const) {
    const { db, store } = await database(); let sends=0;
    try {
      const deps = { token, store, isTest: true, emailEnabled: true, notify: async () => { sends++; return { state, errorCode: "MOCK_FAILURE" }; } };
      assert.equal((await (await acceptWebQuote(request(),deps)).json()).persisted,true);
      await acceptWebQuote(request(),deps); assert.equal(sends,1);
      assert.equal((await db.query<{notification_status:string}>("select notification_status from public.web_quote_leads")).rows[0].notification_status,state);
    } finally { await db.close(); }
  }
});
test("crash after provider acceptance leaves durable claim and prevents resend", async () => {
  const { db, store } = await database(); let sends=0;
  try {
    const broken = { ...store, complete: async () => { throw Error("simulated DB outage"); } };
    const deps = { token, store: broken, isTest: true, emailEnabled: true, notify: async () => { sends++; return { state: "ACCEPTED" as const, providerId: "mock" }; } };
    const body = await (await acceptWebQuote(request(),deps)).json(); assert.equal(body.persisted,true); assert.equal(body.notificationStatus,"UNKNOWN");
    await acceptWebQuote(request(),deps); assert.equal(sends,1);
    assert.equal((await db.query<{notification_status:string}>("select notification_status from public.web_quote_leads")).rows[0].notification_status,"SENDING");
  } finally { await db.close(); }
});
test("SQL permission boundary: anon/authenticated cannot insert or invoke intake", async () => {
  const { db, store } = await database();
  try {
    await store.persist(normalizeQuote(payload()),true);
    for (const role of ["anon","authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select public.accept_boombox_web_quote($1::jsonb,true)", [JSON.stringify(normalizeQuote(payload()))]));
      await assert.rejects(db.query("insert into public.web_quote_leads(solicitud_id,payload,notification_recipient) values ('TEST-BOOMBOX-UNAUTHORIZED','{}','contacto@bbox.cl')"));
      if (role === "anon") await assert.rejects(db.query("select * from public.web_quote_leads"));
      else assert.equal((await db.query("select * from public.web_quote_leads")).rows.length,0);
      await db.exec("reset role");
    }
  } finally { await db.close(); }
});
test("notification has fixed recipient, sends once, and never calls a real network", async () => {
  for (const isTest of [true,false]) {
    let calls=0; let raw="";
    const result = await sendWebQuoteNotification(normalizeQuote(payload()), { isTest, loadToken: async () => "MOCK", fetcher: (async (_url,init) => { calls++; raw = Buffer.from(JSON.parse(String(init?.body)).raw,"base64url").toString(); return Response.json({ id: "MOCK-ID" }); }) as typeof fetch });
    assert.equal(calls,1); assert.equal(result.state,"ACCEPTED"); assert.match(raw,new RegExp(`To: ${isTest ? "matias.maira.larrain@gmail.com" : "contacto@bbox.cl"}`));
    assert.doesNotMatch(raw,/test@example.invalid/); // contact is encoded body, never a recipient header
  }
  let calls=0;
  const result = await sendWebQuoteNotification(normalizeQuote(payload()), { isTest:true, loadToken:async()=>"MOCK", fetcher:(async()=>{calls++;throw Error("timeout");}) as typeof fetch });
  assert.equal(calls,1); assert.equal(result.state,"UNKNOWN");
});
test("persistence outage yields no success and no notification", async () => {
  let sends=0;
  const response = await acceptWebQuote(request(), { token, isTest:true, emailEnabled:true, store:{ persist:async()=>{throw Error("offline");} } as unknown as QuoteStore, notify:async()=>{sends++;return {state:"ACCEPTED"};} });
  assert.equal(response.status,503); assert.equal(sends,0); assert.equal((await response.json()).ok,false);
});
test("notification-claim outage never hides a successfully persisted lead", async () => {
  const { db, store } = await database(); let sends=0;
  try {
    const response = await acceptWebQuote(request(), { token, isTest:true, emailEnabled:true,
      store: { ...store, claim:async()=>{throw Error("uncertain claim");} },
      notify:async()=>{sends++;return {state:"ACCEPTED"};} });
    const body=await response.json();assert.equal(response.status,200);assert.equal(body.persisted,true);assert.equal(body.notificationStatus,"UNKNOWN");assert.equal(sends,0);
    assert.equal((await db.query("select * from public.web_quote_leads")).rows.length,1);
  } finally { await db.close(); }
});
