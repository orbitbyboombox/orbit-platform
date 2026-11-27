import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommercialHubData } from "./types";
import { normalizeEmailNewlines } from "./presentation";
import { loadCompanySettings } from "@/features/company-settings";
import {
  buildCommercialQuoteDetail,
  type CommercialQuoteDetail,
} from "./quote-detail";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const quoteDetailSelect =
  "id,quotation_number,version,status,customer_id,project_id,conversion_transaction_id,issue_date,expiration_date,created_at,updated_at,approved_at,approved_by,approval_reason,converted_at,customer_snapshot,commercial_snapshot,pricing_snapshot,accepted_snapshot,validity_days,deposit_percent,global_discount_type,global_discount_value,subtotal,discount_total,tax_total,grand_total,official_price,final_customer_price,transport_total,customers(full_name,company,rut,email,secondary_email,phone,address),quotation_items(id,item_type,code,description,label,quantity,catalog_price,quoted_price,unit_price,total,discount_type,discount_value,is_manual,display_order)";

export async function loadCommercialQuoteDetail(
  client: SupabaseClient,
  identifier: string,
): Promise<CommercialQuoteDetail | null> {
  const normalized = decodeURIComponent(identifier).trim();
  let query = client
    .from("quotations")
    .select(quoteDetailSelect)
    .is("deleted_at", null);
  query = UUID_PATTERN.test(normalized)
    ? query.eq("id", normalized)
    : query.eq("quotation_number", normalized);
  const { data: quote, error } = await query.maybeSingle();
  if (error) throw error;
  if (!quote) return null;
  const [sendsResult, originResult, versionsResult, transactionResult] = await Promise.all([
    client
      .from("commercial_sends")
      .select(
        "id,status,sent_at,recipient_email,cc_recipients,subject",
      )
      .eq("quotation_id", quote.id)
      .order("sent_at", { ascending: false }),
    client
      .from("project_commercial_origins")
      .select("project_id,created_at")
      .eq("quotation_id", quote.id)
      .maybeSingle(),
    client
      .from("quote_versions")
      .select("id,version_number,status,change_reason,created_at,sent_at,accepted_at,pdf_storage_path")
      .eq("quote_id", quote.id)
      .order("version_number", { ascending: false }),
    quote.conversion_transaction_id
      ? client.from("reservation_transactions")
        .select("id,project_id,status,current_step,last_error,completed_steps,pending_steps")
        .eq("id", quote.conversion_transaction_id)
        .maybeSingle()
      : Promise.resolve(null),
  ]);
  const { data: sends, error: sendsError } = sendsResult;
  if (sendsError) throw sendsError;
  if (originResult.error) throw originResult.error;
  if (versionsResult.error) throw versionsResult.error;
  if (transactionResult?.error) throw transactionResult.error;
  const transaction = transactionResult?.data;
  const linkedProjectId = quote.project_id ?? originResult.data?.project_id ?? transaction?.project_id;
  const conversion = transaction && transaction.project_id === linkedProjectId
    ? {
        transactionId: transaction.id,
        status: transaction.status,
        currentStep: transaction.current_step,
        lastError: transaction.last_error,
        completedSteps: transaction.completed_steps,
        pendingSteps: transaction.pending_steps,
      }
    : undefined;
  return buildCommercialQuoteDetail(
    {
      ...quote,
      project_id: linkedProjectId,
      status: (quote.project_id || originResult.data?.project_id) ? "CONVERTED" : quote.status,
      conversion,
      converted_at: quote.converted_at ?? originResult.data?.created_at,
    },
    sends ?? [],
    versionsResult.data ?? [],
  );
}

const QUOTE_HISTORY_PAGE_SIZE = 20;
const QUOTE_STATUS_FILTERS = new Set(["SENT", "ACCEPTED", "REJECTED", "EXPIRED"]);

async function loadQuoteHistory(client: SupabaseClient, options: { page?: string; filter?: string }) {
  const requestedPage = Number(options.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 1_000_000
    ? requestedPage
    : 1;
  const offset = (page - 1) * QUOTE_HISTORY_PAGE_SIZE;
  let filter = options.filter ?? "ALL";
  let query = client
    .from("quotations")
    .select("id,quotation_number,status,grand_total,issue_date,project_id,customer_snapshot,customers(full_name,company)")
    .is("deleted_at", null);
  if (filter === "WITH_RESERVATION") query = query.not("project_id", "is", null);
  else if (filter === "WITHOUT_RESERVATION") query = query.is("project_id", null);
  else if (filter === "LEGACY") query = query.is("customer_id", null);
  else if (QUOTE_STATUS_FILTERS.has(filter)) query = query.eq("status", filter);
  else filter = "ALL";

  const { data, error } = await query.order("created_at", { ascending: false })
    .order("id", { ascending: false }).range(offset, offset + QUOTE_HISTORY_PAGE_SIZE);
  if (error) throw error;
  const rows = data ?? [];
  return {
    rows: rows.slice(0, QUOTE_HISTORY_PAGE_SIZE),
    pagination: { filter, page, hasNext: rows.length > QUOTE_HISTORY_PAGE_SIZE },
  };
}

export async function loadCommercialHubData(
  client: SupabaseClient,
  quoteHistory: { page?: string; filter?: string } | false = {},
): Promise<CommercialHubData> {
  const [customers, catalog, templates, documents, quotes, sends, company] = await Promise.all([
    client
      .from("customers")
      .select("id,full_name,company,rut,email,secondary_email,phone,address")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    client
      .from("commercial_prices")
      .select("code,label,category,unit_price,pricing_status")
      .eq("enabled", true)
      .is("deleted_at", null)
      .order("category")
      .order("label"),
    client
      .from("commercial_email_templates")
      .select("id,category,subject,body")
      .eq("active", true)
      .order("category"),
    client
      .from("commercial_documents")
      .select("id,name,category,version,filename,status,uploaded_at")
      .order("uploaded_at", { ascending: false }),
    quoteHistory === false ? Promise.resolve(null) : loadQuoteHistory(client, quoteHistory),
    client.from("commercial_sends").select("id,recipient_email,cc_recipients,category,subject,status,sent_at,external_message_id,quotation_id,project_id,customer_id,provider_thread_id,provider_account").order("sent_at", { ascending: false }).limit(20),
    loadCompanySettings(client),
  ]);
  for (const result of [customers, catalog, templates, documents, sends])
    if (result.error) throw result.error;
  const bank = company.pdfConfiguration.commercialBank && typeof company.pdfConfiguration.commercialBank === "object"
    ? company.pdfConfiguration.commercialBank as Record<string, string>
    : {};
  const configuredConditions = Array.isArray(company.pdfConfiguration.commercialReservationConditions)
    ? company.pdfConfiguration.commercialReservationConditions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  return {
    company: { legalName: company.legalName, taxId: company.taxId, address: company.address, city: company.city, phone: company.phone, website: company.website, email: bank.email || company.salesEmail || company.supportEmail, bankName: bank.bankName || "BCI", bankAccountType: bank.accountType || "Cuenta Corriente", bankAccountNumber: bank.accountNumber || "52093409", reservationConditions: configuredConditions, emailSignatureUrl: typeof company.emailConfiguration.signatureGifUrl === "string" ? company.emailConfiguration.signatureGifUrl : "" },
    customers: (customers.data ?? []).map((row) => ({
      id: row.id,
      name: row.full_name,
      company: row.company ?? "",
      rut: row.rut ?? "",
      email: row.email ?? "",
      secondaryEmail: row.secondary_email ?? "",
      phone: row.phone ?? "",
      address: row.address ?? "",
    })),
    catalog: (catalog.data ?? []).map((row) => ({
      code: row.code,
      label: row.label,
      category: row.category,
      unitPrice:
        row.pricing_status === "DEFINED" && row.unit_price != null
          ? Number(row.unit_price)
          : null,
    })),
    templates: (templates.data ?? []).map((template) => ({ ...template, subject: normalizeEmailNewlines(template.subject).replaceAll("\n", " ").trim(), body: normalizeEmailNewlines(template.body) })) as CommercialHubData["templates"],
    documents: (documents.data ?? []).map((document) => ({
      id: document.id,
      name: document.name,
      category: document.category,
      version: document.version,
      filename: document.filename,
      status: document.status,
      uploadedAt: document.uploaded_at,
    })) as CommercialHubData["documents"],
    quoteHistory: quotes?.pagination,
    recentQuotes: (quotes?.rows ?? []).map((row) => {
      const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
      const snapshot = (row.customer_snapshot ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        number: row.quotation_number,
        customer: String(customer?.company || customer?.full_name || snapshot.company || snapshot.contact || "Cliente temporal"),
        total: Number(row.grand_total),
        status: row.status,
        issuedAt: row.issue_date,
        projectId: row.project_id,
      };
    }),
    recentSends: (sends.data ?? []).map((row) => ({ id: row.id, recipient: row.recipient_email, ccRecipients: row.cc_recipients ?? [], category: row.category, subject: row.subject, status: row.status, sentAt: row.sent_at, providerMessageId: row.external_message_id, providerThreadId: row.provider_thread_id, providerAccount: row.provider_account, quotationId: row.quotation_id, projectId: row.project_id, customerId: row.customer_id })),
  };
}
