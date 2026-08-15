import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommercialHubData } from "./types";
import { normalizeEmailNewlines } from "./presentation";
import { loadCompanySettings } from "@/features/company-settings";

export async function loadCommercialHubData(
  client: SupabaseClient,
): Promise<CommercialHubData> {
  const [customers, catalog, templates, documents, quotes, sends, company] = await Promise.all([
    client
      .from("customers")
      .select("id,full_name,company,rut,email,phone,address")
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
    client
      .from("quotations")
      .select(
        "id,quotation_number,status,grand_total,issue_date,customer_id,customer_snapshot,commercial_snapshot,validity_days,deposit_percent,global_discount_type,global_discount_value,customers(full_name,company),quotation_items(code,description,label,quantity,catalog_price,quoted_price,unit_price,discount_type,discount_value,is_manual,display_order)",
      )
      .order("created_at", { ascending: false })
      .limit(20),
    client.from("commercial_sends").select("id,recipient_email,category,subject,status,sent_at").order("sent_at", { ascending: false }).limit(20),
    loadCompanySettings(client),
  ]);
  for (const result of [customers, catalog, templates, documents, quotes, sends])
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
    recentQuotes: (quotes.data ?? []).map((row) => {
      const customer = Array.isArray(row.customers)
        ? row.customers[0]
        : row.customers;
      const snapshot = (row.customer_snapshot ?? {}) as Record<string, unknown>;
      const commercial = (row.commercial_snapshot ?? {}) as Record<string, unknown>;
      const event = (commercial.event ?? {}) as Record<string, string>;
      const customerSnapshot = (row.customer_snapshot ?? {}) as Record<string, string>;
      const quoteLines = [...(row.quotation_items ?? [])].sort((a, b) => Number(a.display_order) - Number(b.display_order));
      return {
        id: row.id,
        number: row.quotation_number,
        customer: String(
          customer?.company ||
            customer?.full_name ||
            snapshot.company ||
            snapshot.contact ||
            "Cliente temporal",
        ),
        total: Number(row.grand_total),
        status: row.status,
        issuedAt: row.issue_date,
        ...(row.status === "DRAFT" && {
          draft: {
            quoteId: row.id,
            existingCustomerId: row.customer_id,
            saveTemporaryCustomer: false,
            company: customerSnapshot.company ?? "",
            rut: customerSnapshot.rut ?? "",
            contact: customerSnapshot.contact ?? "",
            email: customerSnapshot.email ?? "",
            phone: customerSnapshot.phone ?? "",
            address: customerSnapshot.address ?? "",
            eventName: event.name ?? "",
            eventDate: event.date ?? "",
            eventTime: event.time ?? "",
            eventLocation: event.location ?? "",
            eventCity: event.city ?? "",
            validityDays: Number(row.validity_days),
            depositPercent: Number(row.deposit_percent),
            globalDiscountType: row.global_discount_type,
            globalDiscountValue: Number(row.global_discount_value),
            attachCatalog: false,
            lines: quoteLines.map((item) => ({ id: crypto.randomUUID(), code: item.code, description: item.description || item.label, quantity: Number(item.quantity), catalogPrice: item.catalog_price == null ? null : Number(item.catalog_price), quotedPrice: Number(item.quoted_price ?? item.unit_price), discountType: item.discount_type, discountValue: Number(item.discount_value), manual: Boolean(item.is_manual) })),
          },
        }),
      };
    }),
    recentSends: (sends.data ?? []).map((row) => ({ id: row.id, recipient: row.recipient_email, category: row.category, subject: row.subject, status: row.status, sentAt: row.sent_at })),
  };
}
