import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prepareFormalQuotePersistence } from "../features/commercial-hub/quote-persistence.ts";
import { buildQuoteConversionReview, resolveQuoteConversionPaymentTerms } from "../features/commercial-hub/quote-conversion.ts";
import { isCompanyCreditPaymentCategory, resolveReceivablePaymentCategory } from "../features/accounts-receivable/payment-term-classification.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/0176_empresa_credit_receivable_integrity.sql");
const brysaRestore = read("supabase/migrations/0177_restore_brysa_unchanged.sql");
const conversion = read("features/commercial-hub/actions.ts");
const quoteUi = read("features/commercial-hub/commercial-hub.tsx");
const reviewUi = read("features/commercial-hub/quote-conversion-review.tsx");
const quotePdf = read("features/commercial-hub/formal-quote-pdf.ts");
const reservation = read("features/projects/actions/customer.actions.ts");
const driveProvider = read("features/connectors/google-drive/provider/google-drive-live.provider.ts");
const driveSync = read("features/connectors/google-drive/application/google-drive-sync.service.ts");

const draft = (days: number) => ({
  existingCustomerId: "customer", saveTemporaryCustomer: false, company: "Empresa", rut: "76.000.000-0", contact: "Ana", email: "ana@empresa.cl", phone: "", address: "",
  eventName: "Evento", eventDate: "2026-10-10", eventTime: "18:00", eventLocation: "Lugar", eventCity: "Santiago", validityDays: 10, depositPercent: 0,
  paymentCondition: "CORPORATE_CREDIT" as const, paymentTermDays: days, globalDiscountType: null, globalDiscountValue: 0, attachCatalog: false,
  lines: [{ id: "1", code: "CLASSIC", description: "Classic", quantity: 1, catalogPrice: 100000, quotedPrice: 100000, discountType: null, discountValue: 0, manual: false }],
});

for (const days of [15, 30, 45, 60, 90, 120]) {
  test(`Empresa ${days} días persiste como plazo explícito`, () => {
    const persisted = prepareFormalQuotePersistence(draft(days));
    assert.equal(persisted.commercialSnapshot.paymentCondition, "CORPORATE_CREDIT");
    assert.equal(persisted.commercialSnapshot.paymentTermDays, days);
  });
}

test("plazo Empresa positivo distinto de estándar se clasifica como otro crédito", () => {
  const result = resolveReceivablePaymentCategory({ customerType: "CORPORATE", invoicePaymentTerm: "CUSTOM", invoiceCustomTermDays: 120, projectFinance: { paymentCondition: "CORPORATE_CREDIT", paymentTermDays: 120 } });
  assert.equal(result.paymentCategory, "OTRO_CREDITO");
  assert.equal(result.canonicalPaymentTermDays, 120);
});

test("crédito sin plazo no entra silenciosamente al universo Empresa", () => {
  const result = resolveReceivablePaymentCategory({ customerType: "CORPORATE", invoicePaymentTerm: "CASH", invoiceCustomTermDays: null, projectFinance: { paymentCondition: "CORPORATE_CREDIT", paymentTermDays: 0 } });
  assert.equal(result.paymentCategory, "REQUIERE_REVISIÓN");
  assert.equal(isCompanyCreditPaymentCategory(result.paymentCategory), false);
});

test("snapshot aceptado prevalece sobre override de conversión", () => {
  const review = buildQuoteConversionReview({ quoteId: "q", status: "ACCEPTED", snapshot: { commercial: { paymentCondition: "CORPORATE_CREDIT", paymentTermDays: 45 } } });
  assert.deepEqual(resolveQuoteConversionPaymentTerms(review, { paymentCondition: "CASH", paymentTermDays: 0 }), { paymentCondition: "CORPORATE_CREDIT", paymentTermDays: 45 });
});

test("cotización legacy exige selección explícita al convertir", () => {
  const review = buildQuoteConversionReview({ quoteId: "q", status: "ACCEPTED", snapshot: { commercial: {} } });
  assert.throws(() => resolveQuoteConversionPaymentTerms(review, {}), /condición de pago/i);
});

test("constructor ofrece Contado, Reserva y Crédito Empresa", () => {
  for (const value of ["CASH", "FIFTY_FIFTY", "CORPORATE_CREDIT"]) assert.match(quoteUi, new RegExp(value));
  assert.match(quoteUi, /Plazo de crédito/);
});

test("revisión muestra tipo de cliente, condición, plazo y total", () => {
  for (const label of ["TIPO CLIENTE", "CONDICIÓN DE PAGO", "PLAZO", "Total"]) assert.match(reviewUi, new RegExp(label));
});
test("documento comercial muestra condición y plazo sin claves internas", () => { assert.match(quotePdf, /CONDICIÓN DE PAGO/); assert.match(quotePdf, /Crédito Empresa/); assert.match(quotePdf, /días desde emisión de factura/); });

test("conversión transfiere los términos sin fabricar FIFTY_FIFTY", () => {
  assert.match(conversion, /paymentCondition: paymentTerms\.paymentCondition/);
  assert.match(conversion, /paymentTermDays: paymentTerms\.paymentTermDays/);
  assert.doesNotMatch(conversion, /depositPercent >= 100 \? "CASH" : "FIFTY_FIFTY"/);
});

test("conversión reutiliza el pipeline compartido", () => assert.match(conversion, /createCustomerProjectAction\(draft\)/));
test("reserva no crea un segundo documento FAC", () => { assert.doesNotMatch(reservation, /invoiceNumber = `FAC-/); assert.match(reservation, /sync_project_receivable_terms/); });
test("índice impide dos receivables activos", () => assert.match(migration, /invoices_one_active_receivable_per_project_uq/));
test("borradores y cancelados no entran al índice activo", () => assert.match(migration, /status not in\('DRAFT','CANCELLED'\)/));
test("vencimiento deriva de issue_date mediante prepare_invoice", () => { assert.match(migration, /issue_date=coalesce\(issue_date,current_date\)/); assert.doesNotMatch(migration, /due_date\s*=/); });
test("términos estándar y custom comparten un solo mapeo", () => { for (const term of ["DAYS_15", "DAYS_30", "DAYS_45", "DAYS_60", "DAYS_90", "CUSTOM"]) assert.match(migration, new RegExp(term)); });
test("matriz Empresa deriva una sola fila de AR activa", () => assert.match(migration, /join public\.accounts_receivable_projection i on i\.project_id=p\.id/));
test("matriz declara visibilidad en Cuentas por Cobrar", () => assert.match(migration, /true in_accounts_receivable/));
test("matriz declara visibilidad en Crédito Empresas", () => assert.match(migration, /true in_company_credit/));
test("matriz declara visibilidad en Cobrar Clientes", () => assert.match(migration, /true in_collection_center/));
test("matriz excluye saldos pagados", () => assert.match(migration, /i\.amount-i\.paid_amount>0/));
test("matriz excluye proyectos inactivos", () => assert.match(migration, /upper\(p\.status\) not in\('CANCELLED','CANCELED','ARCHIVED'\)/));
test("CCU se repara sólo con identidad, monto y paid_amount exactos", () => { for (const token of ["2026-826", "345100", "paid_amount=0", "893634d4-c550-4821-b35a-0f33873c2576"]) assert.match(migration, new RegExp(token)); });
test("CCU queda como crédito Empresa 30 días", () => { assert.match(migration, /CORPORATE_CREDIT/); assert.match(migration, /paymentTermDays}','30'/); });
test("borrador paralelo CCU se archiva sin eliminarse", () => { assert.match(migration, /FAC-2026-893634D4/); assert.match(migration, /financial_record_state='ARCHIVED'/); assert.doesNotMatch(migration, /delete from public\.invoices/); });
test("Payment Ledger no se modifica", () => { assert.doesNotMatch(migration, /update public\.invoice_payments|insert into public\.invoice_payments|update public\.receivable_movements|insert into public\.receivable_movements|set\s+paid_amount\s*=/); });
test("reparación es idempotente en notas", () => assert.match(migration, /like '%Condición sincronizada desde Evento%'/));
test("Brysa queda restaurada exactamente tras detectar el UUID stale", () => { assert.match(brysaRestore, /14505331-aa33-49a8-8d18-59de68444195/); assert.match(brysaRestore, /payment_term='CASH'/); assert.match(brysaRestore, /due_date='2026-09-19'/); assert.doesNotMatch(brysaRestore, /invoice_payments|receivable_movements/); });
test("clientes protegidos nunca se borran ni recrean", () => { assert.doesNotMatch(migration, /delete from public\.customers|insert into public\.customers/); assert.doesNotMatch(driveSync, /delete.*customers/i); });
test("Drive consulta padres físicos, no sólo metadata local", () => { assert.match(driveProvider, /getFolderParents/); assert.match(driveSync, /actualParents/); });
test("Drive mueve con el mismo Folder ID", () => { assert.match(driveSync, /id:previousEvent\.external_folder_id/); assert.match(driveSync, /previousParentFolderId:physicalPreviousParents/); });
test("Drive limpia last_error después de reconciliar", () => assert.match(driveSync, /last_error:null/));
test("matriz expone estado Calendar", () => assert.match(migration, /calendar_status/));
test("matriz expone estado Drive", () => assert.match(migration, /drive_status/));
test("no se envían comunicaciones por esta corrección interna", () => assert.doesNotMatch(migration, /send|email|communication/i));
test("persistencia reload conserva condición y plazo", () => { const repository=read("features/commercial-hub/repository.ts"); assert.match(repository,/commercial\.paymentCondition/); assert.match(repository,/commercial\.paymentTermDays/); });
