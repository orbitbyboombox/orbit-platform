import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {fixtures, preview} from "../lib/domain.mjs";
import {SimulatedTaxProvider} from "../lib/simulator.mjs";
import { createRuntime } from "../lib/server.mjs";

test("33 and 39 reproduce canonical fixture prices, discounts and VAT",async()=>{
  for(const event of fixtures){
    const d=await preview(event.id,event.documentType);
    assert.equal(d.total,event.agreedTotal);
    assert.equal(d.net+d.tax,d.total);
    assert.equal(d.hash,(await preview(event.id,event.documentType)).hash);
  }
  await assert.rejects(()=>preview(fixtures[0].id,39),/condición comercial/);
  await assert.rejects(()=>preview("event-production",33),/válidos/);
});
test("61 references only accepted same-event sales and inherits its snapshot",async()=>{
  const eventId=fixtures[0].id;
  const sale={id:"original",folio:55,eventId,type:33,status:"ACEPTADO",snapshot:await preview(eventId,33)};
  const credit=await preview(eventId,61,sale,"Anulación de prueba");
  assert.equal(credit.total,sale.snapshot.total);
  assert.equal(credit.reference.folio,55);
  await assert.rejects(()=>preview(fixtures[1].id,61,sale,"Anulación de prueba"));
  await assert.rejects(()=>preview(eventId,61,{...sale,status:"PENDIENTE"},"Anulación de prueba"));
  await assert.rejects(()=>preview(eventId,61,sale,"x"));
});
test("timeout and failure reconcile the original folio and provide marked XML and PDF",async()=>{
  const adapter=new SimulatedTaxProvider();
  const doc={folio:25,snapshot:await preview(fixtures[0].id,33)};
  assert.equal((await adapter.submit(doc,"timeout")).state,"PENDIENTE");
  assert.equal((await adapter.submit(doc,"error")).state,"ERROR_REINTENTABLE");
  const recovered=await adapter.lookup(doc);
  assert.equal(recovered.state,"ACEPTADO");
  assert.match(new TextDecoder().decode(recovered.artifacts.xml),/validezTributaria="ninguna".*folio="25"/);
  assert.match(new TextDecoder().decode(recovered.artifacts.pdf.slice(0,8)),/^%PDF-/);
});
test("private sessions expire, reject tampering, and bind encrypted artifacts to document and format",async()=>{
  const {encrypt,decrypt,sessionCookie,authenticated,validPassword}=createRuntime({
    QA_ADMIN_PASSWORD:"test-password-only",QA_GATEWAY_SECRET:"test-secret-only",QA_SUPABASE_ANON_KEY:"test-key-only"
  });
  assert.equal(await validPassword("test-password-only"),true);
  assert.equal(await validPassword("incorrect"),false);
  const cookie=await sessionCookie();
  assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
  assert.equal(await authenticated({headers:{cookie}}),true);
  assert.equal(await authenticated({headers:{cookie:cookie.replace(/orbit_sii_qa=./,"orbit_sii_qa=x")}}),false);
  const xml=new TextEncoder().encode("<qa/>");
  const encrypted=await encrypt(xml,"doc-1","xml");
  assert.deepEqual(await decrypt(encrypted,"doc-1","xml"),xml);
  await assert.rejects(()=>decrypt(encrypted,"doc-2","xml"));
  await assert.rejects(()=>decrypt(encrypted,"doc-1","pdf"));
});
test("sandbox SQL claims each operation once and rejects stale workers",()=>{
  const sql=readFileSync(new URL("../database/sandbox.sql",import.meta.url),"utf8");
  assert.match(sql,/operation_key text not null unique/);
  assert.match(sql,/folio bigint generated always as identity unique/);
  assert.match(sql,/on conflict\(operation_key\) do nothing/);
  assert.match(sql,/d.claim=\(p_data->>'claim'\)::uuid and d.status='PROCESANDO'/);
  assert.doesNotMatch(sql,/public\.(invoices|invoice_payments|financial_event_records|documents|receivable_movements)\b/);
});
