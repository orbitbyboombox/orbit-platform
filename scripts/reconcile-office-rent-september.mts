import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createOfficeLeaseReceiptPdf } from "../features/office-rent/receipt-pdf.ts";
import type { OfficeLeaseSettings } from "../features/office-rent/model.ts";

try { process.loadEnvFile(".env.local"); } catch { process.loadEnvFile(); }

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY/SERVICE_ROLE_KEY.");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const [settingsResult, companyResult, obligationResult, paymentResult] = await Promise.all([
  client.from("office_lease_settings").select("*").eq("settings_key", "PRIMARY").single(),
  client.from("company_settings").select("brand_name,legal_name,tax_id,address,city").limit(1).single(),
  client.from("office_lease_obligations").select("id,period,amount_due,status").eq("period", "2026-09-01").single(),
  client.from("office_lease_payments").select("id,obligation_id,amount,paid_on,payment_method,observation,receipt_number,created_by").eq("idempotency_key", "office-rent:2026-09:initial-income").single(),
]);
const error = settingsResult.error ?? companyResult.error ?? obligationResult.error ?? paymentResult.error;
if (error) throw error;
if (!settingsResult.data || !companyResult.data || !obligationResult.data || !paymentResult.data) throw new Error("Faltan datos canónicos para generar el recibo N°001.");
const companyRow = companyResult.data;
const obligation = obligationResult.data;
const payment = paymentResult.data;
if (Number(obligation.amount_due) !== 240_000 || obligation.status !== "PAID") throw new Error("Septiembre no está conciliado como obligación pagada de $240.000.");
if (Number(payment.amount) !== 690_000 || Number(payment.receipt_number) !== 1) throw new Error("El ingreso inicial o correlativo N°001 no coincide.");

const itemsResult = await client.from("office_lease_income_items")
  .select("item_type,description,detail,amount,sort_order")
  .eq("payment_id", payment.id)
  .order("sort_order");
if (itemsResult.error) throw itemsResult.error;
const items = itemsResult.data ?? [];
const guarantee = items.find((item) => item.item_type === "SECURITY_DEPOSIT");
const rent = items.find((item) => item.item_type === "RENT");
if (Number(guarantee?.amount) !== 450_000 || Number(rent?.amount) !== 240_000 || items.reduce((sum, item) => sum + Number(item.amount), 0) !== 690_000) {
  throw new Error("Las líneas de garantía y arriendo proporcional no cuadran con $690.000.");
}

const row = settingsResult.data;
const settings: OfficeLeaseSettings = {
  id: row.id,
  tenantLegalName: row.tenant_legal_name,
  tenantRut: row.tenant_rut,
  tenantAddress: row.tenant_address,
  tenantEmail: row.tenant_email ?? "",
  tenantPhone: row.tenant_phone ?? "",
  tenantRepresentative: row.tenant_representative ?? "",
  contractStartDate: row.contract_start_date ?? "",
  contractEndDate: row.contract_end_date ?? "",
  observations: row.observations ?? "",
  unitName: row.unit_name,
  propertyAddress: row.property_address ?? "",
  concept: row.concept,
  monthlyAmount: Number(row.monthly_amount),
  commonExpensesIncluded: Boolean(row.common_expenses_included),
  dueDay: Number(row.due_day),
  mortgageCost: Number(row.mortgage_cost),
  commonExpensesCost: Number(row.common_expenses_cost),
  version: Number(row.version),
};
const company = {
  brandName: companyRow.brand_name || "BOOMBOX",
  legalName: companyRow.legal_name || companyRow.brand_name || "BOOMBOX",
  taxId: companyRow.tax_id ?? "",
  address: companyRow.address ?? "",
  city: companyRow.city ?? "",
};
const pdf = await createOfficeLeaseReceiptPdf({
  settings,
  company,
  payment: {
    receiptNumber: 1,
    paidOn: payment.paid_on,
    amount: 690_000,
    paymentMethod: payment.payment_method,
    observation: "",
    lineItems: items.map((item) => ({
      itemType: item.item_type as "RENT" | "SECURITY_DEPOSIT",
      description: item.description,
      detail: item.detail ?? "",
      amount: Number(item.amount),
    })),
  },
  period: "2026-09-01",
});

const outputDirectory = resolve("output/pdf");
const outputPath = resolve(outputDirectory, "RECIBO_ARRIENDO_N-001_SEPTIEMBRE_2026.pdf");
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, pdf);

const storagePath = "office-rent/receipts/RECIBO_ARRIENDO_N-001.pdf";
const upload = await client.storage.from("orbit-documents").upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });
if (upload.error) throw upload.error;
const checksum = createHash("sha256").update(pdf).digest("hex");
const documentResult = await client.from("office_lease_documents").upsert({
  settings_id: settings.id,
  obligation_id: payment.obligation_id,
  payment_id: payment.id,
  document_type: "INCOME_RECEIPT",
  storage_bucket: "orbit-documents",
  storage_path: storagePath,
  original_filename: "RECIBO_ARRIENDO_N-001.pdf",
  mime_type: "application/pdf",
  checksum,
  idempotency_key: `office-rent-receipt:${payment.id}`,
  created_by: payment.created_by,
  deleted_at: null,
}, { onConflict: "idempotency_key" }).select("id").single();
if (documentResult.error) throw documentResult.error;

process.stdout.write(`${JSON.stringify({ outputPath, paymentId: payment.id, documentId: documentResult.data.id, receiptNumber: 1, total: 690_000 })}\n`);
