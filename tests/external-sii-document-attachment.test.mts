import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const root=process.cwd();
const sql=readFileSync(`${root}/supabase/migrations/0158_external_tax_document_attachment.sql`,"utf8");
const action=readFileSync(`${root}/features/external-tax-documents/actions.ts`,"utf8");
const ui=readFileSync(`${root}/features/external-tax-documents/external-tax-documents-center.tsx`,"utf8");
const routing=readFileSync(`${root}/features/connectors/google-drive/application/google-drive-folder-strategy.ts`,"utf8");

test("0158 supports the canonical external SII taxonomy",()=>{for(const type of ["FACTURA","BOLETA","NOTA_CREDITO","NOTA_DEBITO"])assert.match(sql,new RegExp(type));assert.match(sql,/'EXTERNAL_TAX_DOCUMENT'/)});
test("tax evidence links customer project event and optional ORBIT invoice",()=>{for(const field of ["project_id","customer_id","invoice_id","orbit_event_id"])assert.match(sql,new RegExp(field));assert.match(sql,/La factura ORBIT no corresponde al Evento/)});
test("attachment never mutates financial truth",()=>{assert.doesNotMatch(sql,/update\s+public\.(invoices|invoice_payments|receivable_movements)/i);assert.doesNotMatch(action,/\.from\("(?:invoices|invoice_payments|receivable_movements)"\)\.update/)});
test("checksum folio and idempotency prevent real duplicates",()=>{assert.match(sql,/documents_external_tax_checksum_uq/);assert.match(sql,/documents_external_tax_folio_uq/);assert.match(sql,/idempotency_key=p_idempotency_key/);assert.match(action,/external-sii\|/)});
test("Drive uses existing project billing folder",()=>{assert.match(action,/kind: "INVOICE"/);assert.match(routing,/INVOICE: "07_Facturación"/)});
test("Founder mobile form is canonical and Staff is rejected",()=>{assert.match(action,/\["CEO", "ADMINISTRATOR"\]/);assert.doesNotMatch(action,/"STAFF"/);assert.match(ui,/variant="fullscreen-mobile"/);assert.match(ui,/capture="environment"/);assert.match(ui,/application\/pdf,image\/jpeg,image\/png/)});
test("UI exposes pending state and attached evidence",()=>{assert.match(ui,/Pendiente de documento tributario/);assert.match(ui,/Adjuntar documento SII/);assert.match(ui,/Ver documento/)});
test("0158 installs no documents or automatic backfill",()=>{const installation=sql.split("create or replace function public.register_external_tax_document")[0];assert.doesNotMatch(installation,/insert\s+into\s+public\.documents/i);assert.doesNotMatch(installation,/update\s+public\.documents/i);assert.doesNotMatch(sql,/perform\s+public\.register_external_tax_document|select\s+public\.register_external_tax_document/i)});
