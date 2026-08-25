import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const root=process.cwd();
const hub=readFileSync(`${root}/features/external-tax-documents/event-commercial-document-hub.tsx`,"utf8");
const workspace=readFileSync(`${root}/features/projects/components/project-workspace-experience.tsx`,"utf8");
const page=readFileSync(`${root}/app/(platform)/projects/[projectId]/page.tsx`,"utf8");

test("Evento exposes one unified commercial document hub",()=>{assert.match(hub,/DOCUMENTOS COMERCIALES/);assert.match(workspace,/EventCommercialDocumentHub/);assert.equal((workspace.match(/ExternalTaxDocumentsCenter/g)||[]).length,0)});
test("hub reuses quotation contract tax and payment documents",()=>{for(const value of ["COTIZACIÓN","CONTRATO","FACTURA \/ SII","COMPROBANTES DE PAGO","OTROS"])assert.match(hub,new RegExp(value));assert.match(hub,/ExternalTaxDocumentsCenter/)});
test("AR is the only source for collected outstanding and due date",()=>{assert.match(workspace,/paid:event\.receivable\.paidAmount/);assert.match(workspace,/outstanding:event\.receivable\.outstandingBalance/);assert.match(workspace,/dueDate:event\.receivable\.dueDate/);assert.doesNotMatch(hub,/amount\s*-\s*paid|reduce\(/)});
test("corporate and particular conditions use canonical classifier",()=>{assert.match(page,/resolveReceivablePaymentCategory/);assert.match(page,/Crédito Empresa · 30 días/);assert.match(page,/Saldo cliente \/ 50%/)});
test("quick actions reuse existing payment AR and SII flows",()=>{assert.match(hub,/href="#payment-management">Registrar pago/);assert.match(hub,/href="\/finance\/receivables"/);assert.match(hub,/ExternalTaxDocumentsCenter/);assert.doesNotMatch(hub,/from\(|rpc\(|fetch\(/)});
test("mobile is inline touch friendly and OC reuses the canonical MobileDialog",()=>{assert.match(hub,/grid gap-2 sm:grid-cols-2 lg:grid-cols-5/);assert.match(hub,/min-h-11/);assert.match(hub,/CustomerPurchaseOrderCenter/)});
test("financial and Staff scope remain isolated",()=>{assert.doesNotMatch(hub,/invoice_payments|receivable_movements|update\(|insert\(/);assert.doesNotMatch(page,/staff.*commercialHub/i)});
