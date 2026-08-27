import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanySettings } from "@/features/company-settings";
import { createFormalQuotePdf } from "./formal-quote-pdf";
import { normalizeQuoteOperationalConditions } from "./operational-conditions";
import { quoteDisplayFilename } from "./presentation";

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export type FormalQuoteDocument = {
  quotationId: string;
  quotationNumber: string;
  filename: string;
  mimeType: "application/pdf";
  bytes: Uint8Array;
  total: number;
};

export type ReservationCommercialDocument = {
  filename: string;
  mimeType: "application/pdf";
  bytes: Uint8Array;
  sourceType: "STORED_COMMERCIAL_DOCUMENT" | "ACCEPTED_QUOTATION";
  sourceReference: string;
};

const plainQuoteNumber = (value: string) =>
  value.replace(/^COTIZACI[ÓO]N\s*/i, "").trim();

export function reservationCommercialDocumentFilename(
  quotationNumber: string,
  storedCommercialDocument: boolean,
) {
  return storedCommercialDocument
    ? `Documento Comercial BOOMBOX ${plainQuoteNumber(quotationNumber)}.pdf`
    : quoteDisplayFilename(quotationNumber);
}

/**
 * One canonical renderer for both the Founder PDF route and customer email
 * attachments. Accepted snapshots remain the immutable commercial source.
 */
export async function loadFormalQuoteDocument(
  client: SupabaseClient,
  quotationId: string,
): Promise<FormalQuoteDocument> {
  const [{ data: quote, error }, company] = await Promise.all([
    client
      .from("quotations")
      .select(
        "id,status,quotation_number,issue_date,expiration_date,customer_snapshot,commercial_snapshot,accepted_snapshot,quotation_items(description,label,quantity,quoted_price,unit_price,total,display_order)",
      )
      .eq("id", quotationId)
      .single(),
    loadCompanySettings(client),
  ]);
  if (error || !quote) throw error ?? new Error("Cotización no encontrada.");

  const accepted = object(quote.accepted_snapshot);
  const acceptedQuotation = object(accepted.quotation);
  const snapshot = Object.keys(object(accepted.commercial)).length
    ? object(accepted.commercial)
    : object(quote.commercial_snapshot);
  const customer = Object.keys(object(accepted.customer)).length
    ? object(accepted.customer)
    : object(quote.customer_snapshot);
  const event = object(snapshot.event);
  const pdfConfiguration = company.pdfConfiguration;
  const bank = object(pdfConfiguration.commercialBank) as Record<string, string>;
  const configuredConditions = Array.isArray(
    pdfConfiguration.commercialReservationConditions,
  )
    ? pdfConfiguration.commercialReservationConditions.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      )
    : [];
  const acceptedItems = Array.isArray(accepted.items)
    ? accepted.items.map((item) => {
        const value = object(item);
        return {
          description: String(value.label ?? value.code ?? "Ítem"),
          label: String(value.label ?? ""),
          quantity: Number(value.quantity ?? 1),
          quoted_price: Number(value.quotedPrice ?? 0),
          unit_price: Number(value.quotedPrice ?? 0),
          total: Number(value.total ?? 0),
          display_order: Number(value.displayOrder ?? 0),
        };
      })
    : [];
  const items = [
    ...(acceptedItems.length ? acceptedItems : quote.quotation_items ?? []),
  ].sort((a, b) => Number(a.display_order) - Number(b.display_order));
  const quotationNumber = String(
    acceptedQuotation.number ?? quote.quotation_number,
  );
  const bytes = await createFormalQuotePdf({
    number: quotationNumber,
    issueDate: String(acceptedQuotation.issueDate ?? quote.issue_date),
    expirationDate: String(
      acceptedQuotation.expirationDate ?? quote.expiration_date,
    ),
    customer,
    event,
    lines: items.map((item) => ({
      description: item.description || item.label,
      quantity: Number(item.quantity),
      quotedPrice: Number(item.quoted_price ?? item.unit_price),
      total: Number(item.total),
    })),
    subtotal: Number(snapshot.subtotal ?? 0),
    discount: Number(snapshot.discount ?? 0),
    net: Number(snapshot.net ?? 0),
    tax: Number(snapshot.tax ?? 0),
    total: Number(snapshot.total ?? 0),
    deposit: Number(snapshot.deposit ?? 0),
    balance: Number(snapshot.balance ?? 0),
    depositPercent: Number(snapshot.depositPercent ?? 50),
    paymentCondition:
      snapshot.paymentCondition === "CORPORATE_CREDIT" ||
      snapshot.paymentCondition === "CASH"
        ? snapshot.paymentCondition
        : "FIFTY_FIFTY",
    paymentTermDays: Number(snapshot.paymentTermDays ?? 0),
    company: {
      legalName: company.legalName,
      taxId: company.taxId,
      address: company.address,
      city: company.city,
      phone: company.phone,
      email: bank.email || company.salesEmail || company.supportEmail,
      website: company.website,
      bankName: bank.bankName || "Banco no configurado",
      bankAccountType: bank.accountType || "Cuenta no configurada",
      bankAccountNumber: bank.accountNumber || "Número no configurado",
      reservationConditions: configuredConditions,
      operationalConditions: normalizeQuoteOperationalConditions(
        pdfConfiguration.commercialOperationalConditions,
      ),
    },
  });
  return {
    quotationId: quote.id,
    quotationNumber,
    filename: quoteDisplayFilename(quotationNumber),
    mimeType: "application/pdf",
    bytes: new Uint8Array(bytes),
    total: Number(snapshot.total ?? 0),
  };
}

export async function loadReservationCommercialDocument(
  client: SupabaseClient,
  input: {
    projectId: string;
    quotationId: string;
    quotationNumber: string;
  },
): Promise<ReservationCommercialDocument> {
  const { data: agreement, error: agreementError } = await client
    .from("agreements")
    .select("id,status,signed_pdf_path,created_at")
    .eq("project_id", input.projectId)
    .in("status", ["COMMERCIAL_DOCUMENT", "SIGNED"])
    .not("signed_pdf_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (agreementError) throw agreementError;
  if (agreement?.signed_pdf_path) {
    const { data, error } = await client.storage
      .from("orbit-documents")
      .download(agreement.signed_pdf_path);
    if (error || !data)
      throw error ?? new Error("No fue posible recuperar el documento comercial formal.");
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (String.fromCharCode(...bytes.subarray(0, 4)) !== "%PDF")
      throw new Error("El documento comercial almacenado no es un PDF válido.");
    return {
      filename: reservationCommercialDocumentFilename(
        input.quotationNumber,
        true,
      ),
      mimeType: "application/pdf",
      bytes,
      sourceType: "STORED_COMMERCIAL_DOCUMENT",
      sourceReference: agreement.id,
    };
  }
  const generated = await loadFormalQuoteDocument(client, input.quotationId);
  if (!(generated.total > 0))
    throw new Error("La cotización aceptada no contiene un total comercial válido.");
  return {
    filename: generated.filename,
    mimeType: generated.mimeType,
    bytes: generated.bytes,
    sourceType: "ACCEPTED_QUOTATION",
    sourceReference: generated.quotationId,
  };
}
