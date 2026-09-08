import "server-only";
import { createHash, randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanySettings } from "@/features/company-settings";
import { createFormalQuotePdf } from "./formal-quote-pdf";
import { normalizeQuoteOperationalConditions } from "./operational-conditions";
import { quoteDisplayFilename } from "./presentation";
import { resolveCommercialBreakdown } from "./commercial-breakdown";

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

const sha256 = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

export async function generateCommercialDocument(input: { client: SupabaseClient; projectId: string; quotationId: string; actorId: string }) {
  const document = await loadFormalQuoteDocument(input.client, input.quotationId);
  const { data: project, error: projectError } = await input.client.from("projects").select("customer_id,orbit_event_id").eq("id", input.projectId).is("deleted_at", null).single();
  if (projectError || !project) throw projectError ?? new Error("Evento no encontrado.");
  const { data: current, error: currentError } = await input.client.from("documents").select("id,version").eq("project_id", input.projectId).eq("document_type", "COMMERCIAL_DOCUMENT").eq("is_current", true).is("deleted_at", null).order("version", { ascending: false }).limit(1).maybeSingle();
  if (currentError) throw currentError;
  if (current) return { documentId: current.id, version: Number(current.version ?? 1), filename: document.filename, reused: true };
  const { data: latest, error: latestError } = await input.client.from("documents").select("version").eq("project_id", input.projectId).eq("document_type", "COMMERCIAL_DOCUMENT").is("deleted_at", null).order("version", { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw latestError;
  const version = Number(latest?.version ?? 0) + 1;
  const documentId = randomUUID();
  const storagePath = `${input.projectId}/commercial-document-v${version}-${documentId}.pdf`;
  const upload = await input.client.storage.from("orbit-documents").upload(storagePath, document.bytes, { contentType: "application/pdf", upsert: false });
  if (upload.error) throw upload.error;
  try {
    const { error: insertError } = await input.client.from("documents").insert({ id: documentId, project_id: input.projectId, customer_id: project.customer_id, orbit_event_id: project.orbit_event_id, document_type: "COMMERCIAL_DOCUMENT", storage_bucket: "orbit-documents", storage_path: storagePath, checksum: sha256(document.bytes), created_by: input.actorId, uploaded_by: input.actorId, version, is_current: true, workflow_status: "APPROVED", metadata: { source: "FOUNDER_RESERVATION_DOCUMENT", reason: "INITIAL_GENERATION" } });
    if (insertError) throw insertError;
    const { error: timelineError } = await input.client.from("timeline_events").insert({ customer_id: project.customer_id, project_id: input.projectId, orbit_event_id: project.orbit_event_id, event_type: "COMMERCIAL_DOCUMENT_GENERATED", title: "Documento comercial oficial generado", description: `Versión ${version}.`, actor_id: input.actorId, actor_label: "Founder", source: "Administrator", action: "COMMERCIAL_DOCUMENT_GENERATED", entity_type: "Document", entity_id: documentId, human_message: "Documento comercial generado sin enviar correo.", correlation_id: `commercial-document-generation:${input.projectId}:${version}`, created_by: input.actorId });
    if (timelineError) throw timelineError;
  } catch (error) {
    await input.client.from("documents").delete().eq("id", documentId);
    await input.client.storage.from("orbit-documents").remove([storagePath]);
    throw error;
  }
  return { documentId, version, filename: document.filename, reused: false };
}

export async function regenerateCommercialDocument(input: { client: SupabaseClient; projectId: string; quotationId: string; agreementId: string; actorId: string }) {
  const { data: agreement, error: agreementError } = await input.client.from("agreements").select("id,status").eq("id", input.agreementId).eq("project_id", input.projectId).single();
  if (agreementError || !agreement) throw agreementError ?? new Error("Documento no encontrado.");
  if (agreement.status === "SIGNED") throw new Error("Este documento está firmado y no puede regenerarse.");
  const document = await loadFormalQuoteDocument(input.client, input.quotationId);
  const { data: previous, error: previousError } = await input.client.from("documents").select("id,version,is_current,storage_path,metadata").eq("project_id", input.projectId).eq("document_type", "COMMERCIAL_DOCUMENT").is("deleted_at", null).order("version", { ascending: false });
  if (previousError) throw previousError;
  const nextVersion = (Number(previous?.[0]?.version) || 0) + 1;
  const previousCurrent = previous?.find((item) => item.is_current) ?? null;
  const newId = randomUUID();
  const path = `${input.projectId}/commercial-document-v${nextVersion}-${newId}.pdf`;
  const upload = await input.client.storage.from("orbit-documents").upload(path, document.bytes, { contentType: "application/pdf", upsert: false });
  if (upload.error) throw upload.error;
  const { data: project, error: projectError } = await input.client.from("projects").select("customer_id,orbit_event_id").eq("id", input.projectId).single();
  if (projectError || !project) throw projectError ?? new Error("Evento no encontrado.");
  let previousWasReleased = false;
  let newRowInserted = false;
  try {
    if (previousCurrent) {
      const { error } = await input.client.from("documents").update({ is_current: false, metadata: { supersededBy: newId, supersededAt: new Date().toISOString(), reason: "DOCUMENT_CORRECTION" } }).eq("id", previousCurrent.id);
      if (error) throw error;
      previousWasReleased = true;
    }
    const { error: insertError } = await input.client.from("documents").insert({ id: newId, project_id: input.projectId, customer_id: project.customer_id, orbit_event_id: project.orbit_event_id, document_type: "COMMERCIAL_DOCUMENT", storage_bucket: "orbit-documents", storage_path: path, checksum: sha256(document.bytes), created_by: input.actorId, uploaded_by: input.actorId, version: nextVersion, is_current: true, workflow_status: "APPROVED", metadata: { source: "FOUNDER_DOCUMENT_CORRECTION", reason: "DOCUMENT_CORRECTION", agreementId: input.agreementId, previousDocumentId: previousCurrent?.id ?? null } });
    if (insertError) throw insertError;
    newRowInserted = true;
    const { error: timelineError } = await input.client.from("timeline_events").insert({ customer_id: project.customer_id, project_id: input.projectId, orbit_event_id: project.orbit_event_id, event_type: "COMMERCIAL_DOCUMENT_CORRECTED", title: "Documento comercial corregido generado", description: `Versión ${nextVersion}; versión anterior conservada.`, actor_id: input.actorId, actor_label: "Founder", source: "Administrator", action: "DOCUMENT_CORRECTION", entity_type: "Document", entity_id: newId, human_message: "Se generó una nueva versión comercial sin enviar correo.", correlation_id: `commercial-document-correction:${input.projectId}:${nextVersion}`, created_by: input.actorId });
    if (timelineError) throw timelineError;
  } catch (error) {
    // Never leave an unattached PDF in the canonical bucket when metadata
    // persistence fails. The previous document remains untouched.
    if (newRowInserted) await input.client.from("documents").delete().eq("id", newId);
    if (previousWasReleased && previousCurrent) {
      await input.client.from("documents").update({ is_current: true, metadata: previousCurrent.metadata ?? {} }).eq("id", previousCurrent.id);
    }
    await input.client.storage.from("orbit-documents").remove([path]);
    throw error;
  }
  return { documentId: newId, version: nextVersion, filename: document.filename };
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
        "id,status,quotation_number,issue_date,expiration_date,customer_snapshot,commercial_snapshot,pricing_snapshot,accepted_snapshot,quotation_items(description,label,quantity,quoted_price,unit_price,total,item_type,display_order)",
      )
      .eq("id", quotationId)
      .single(),
    loadCompanySettings(client),
  ]);
  if (error || !quote) throw error ?? new Error("Cotización no encontrada.");

  const accepted = object(quote.accepted_snapshot);
  const acceptedQuotation = object(accepted.quotation);
  const pricingSnapshot = object(quote.pricing_snapshot);
  const hasManualPricing = Object.keys(pricingSnapshot).some((key) =>
    ["commercial", "commercialNegotiation", "negotiatedServicePrice", "negotiatedTransport", "netAmount", "vatAmount", "finalPrice"].includes(key),
  );
  const snapshot = Object.keys(object(accepted.commercial)).length
    ? object(accepted.commercial)
    : hasManualPricing
      ? { ...pricingSnapshot, ...object(pricingSnapshot.commercial) }
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
          item_type: String(value.itemType ?? value.item_type ?? ""),
          display_order: Number(value.displayOrder ?? 0),
        };
      })
    : [];
  const pricingItems = Array.isArray(pricingSnapshot.items)
    ? pricingSnapshot.items.map((item) => {
        const value = object(item);
        return {
          description: String(value.label ?? value.code ?? "Ítem"),
          label: String(value.label ?? ""),
          quantity: Number(value.quantity ?? 1),
          quoted_price: Number(value.quotedPrice ?? 0),
          unit_price: Number(value.quotedPrice ?? 0),
          total: Number(value.total ?? 0),
          item_type: String(value.itemType ?? value.item_type ?? ""),
          display_order: Number(value.displayOrder ?? 0),
        };
      })
    : [];
  const items = [
    ...(acceptedItems.length ? acceptedItems : pricingItems.length ? pricingItems : quote.quotation_items ?? []),
  ].sort((a, b) => Number(a.display_order) - Number(b.display_order));
  // Legacy manual quotations can retain historical quotation_items (for
  // example the original catalogue price). When the canonical pricing
  // snapshot contains a negotiated service amount, the PDF line item must
  // follow that value as well as the commercial summary.
  const negotiatedServicePrice = Number(
    pricingSnapshot.negotiatedServicePrice ??
      object(pricingSnapshot.commercialNegotiation).negotiatedServicePrice ??
      object(pricingSnapshot.commercial).negotiatedServicePrice ??
      NaN,
  );
  const pdfItems = Number.isFinite(negotiatedServicePrice)
    ? items.map((item) =>
        String(item.item_type ?? "").toUpperCase() === "SERVICE"
          ? { ...item, quoted_price: negotiatedServicePrice, unit_price: negotiatedServicePrice, total: negotiatedServicePrice * Number(item.quantity || 1) }
          : item,
      )
    : items;
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
    lines: pdfItems.map((item) => ({
      description: item.description || item.label,
      itemType: item.item_type,
      quantity: Number(item.quantity),
      quotedPrice: Number(item.quoted_price ?? item.unit_price),
      total: Number(item.total),
    })),
    ...resolveCommercialBreakdown({ snapshot, items: pdfItems }),
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
  if (agreement?.status === "SIGNED" && agreement.signed_pdf_path) {
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
  const { data: currentDocument, error: currentDocumentError } = await client
    .from("documents")
    .select("id,storage_path,version")
    .eq("project_id", input.projectId)
    .eq("document_type", "COMMERCIAL_DOCUMENT")
    .eq("is_current", true)
    .is("deleted_at", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (currentDocumentError) throw currentDocumentError;
  if (currentDocument?.storage_path) {
    const { data, error } = await client.storage.from("orbit-documents").download(currentDocument.storage_path);
    if (error || !data) throw error ?? new Error("No fue posible recuperar el documento comercial vigente.");
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (String.fromCharCode(...bytes.subarray(0, 4)) !== "%PDF") throw new Error("El documento comercial vigente no es un PDF válido.");
    return { filename: reservationCommercialDocumentFilename(input.quotationNumber, false), mimeType: "application/pdf", bytes, sourceType: "STORED_COMMERCIAL_DOCUMENT", sourceReference: currentDocument.id };
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
