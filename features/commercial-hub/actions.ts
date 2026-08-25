"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import type { CommercialCategory, FormalQuoteDraft } from "./types";
import { isCommercialEmail } from "./quote-calculation";
import { prepareFormalQuotePersistence } from "./quote-persistence";
import { createFormalQuotePdf } from "./formal-quote-pdf";
import { loadCompanySettings } from "@/features/company-settings";
import { createCustomerProjectAction } from "@/features/projects/actions/customer.actions";
import type { ProjectDraft } from "@/features/projects/types/project";
import { QUICK_SEND_CTA_FALLBACK, QUICK_SEND_CTA_LABEL, commercialSignatureMode, emailParagraphs, formalQuoteSubject, normalizeEmailNewlines, quickSendBodyParagraphs, quoteDisplayFilename, quoteStorageKey, resolveQuickSendBody, withoutDuplicateSignature } from "./presentation";
import { catalogCategoryForQuickSend, catalogPublicUrl, isCommercialCatalogCategory } from "./catalogs";
import { normalizeQuoteOperationalConditions } from "./operational-conditions";
import { normalizeEmailRecipients, normalizeOptionalEmail } from "@/lib/email/recipients";
import { attachCustomerPurchaseOrderAction } from "@/features/commercial-documents/actions";
import { archiveAcceptedQuoteForProject } from "@/features/commercial-documents/drive-archive";
import {
  assertQuoteConversionReady,
  buildQuoteConversionReview,
  resolveQuoteConversionCustomer,
  type QuoteConversionOverrides,
} from "./quote-conversion";

async function founder() {
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Sesión requerida.");
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (!profile || !["CEO", "ADMINISTRATOR", "SALES"].includes(profile.role))
    throw new Error("No tienes permiso comercial.");
  return { client, user: data.user, role: profile.role };
}
const fail = (error: unknown, fallback: string) => ({
  ok: false as const,
  error:
    error instanceof Error &&
    !/constraint|pgrst|schema|json|coerce/i.test(error.message)
      ? error.message
      : fallback,
});
const replace = (value: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce(
    (text, [key, item]) => text.replaceAll(`[${key}]`, item),
    value,
  );

export async function sendCommercialInformationAction(input: {
  category: Exclude<CommercialCategory, "COMPANIES_QUOTE">;
  email: string;
  name: string;
  subject: string;
  body: string;
  documentId: string;
  requestId: string;
  attachPdf?: boolean;
}) {
  try {
    const { user } = await founder();
    if (!isCommercialEmail(input.email))
      throw new Error("Ingresa un correo válido.");
    if (!input.documentId)
      throw new Error("No existe un documento ACTIVE para esta categoría.");
    const admin = createAdminClient();
    const company = await loadCompanySettings(admin);
    const { data: existing } = await admin.from("commercial_sends").select("status").eq("idempotency_key", input.requestId).maybeSingle();
    if (existing?.status === "SENT") return { ok: true as const, message: "Este envío ya fue procesado." };
    const { data: document, error } = await admin
      .from("commercial_documents")
      .select("id,name,version,filename,storage_path,status,category")
      .eq("id", input.documentId)
      .eq("status", "ACTIVE")
      .single();
    if (error || !document)
      throw new Error("El documento comercial ya no está disponible.");
    if (!isCommercialCatalogCategory(document.category)) throw new Error("La categoría del catálogo no es válida.");
    if (document.category !== catalogCategoryForQuickSend(input.category))
      throw new Error("El catálogo no corresponde a esta comunicación.");
    const vars = { Empresa: input.name.trim() || "" };
    const subject = normalizeEmailNewlines(replace(input.subject, vars)).replaceAll("\n", " ").trim();
    const body = resolveQuickSendBody(input.body, input.name);
    const { data: claimed, error: claimError } = await admin.from("commercial_sends").insert({
      idempotency_key: input.requestId,
      recipient_email: input.email.trim().toLowerCase(),
      recipient_name: input.name.trim() || null,
      category: input.category,
      document_id: document.id,
      subject,
      body_snapshot: body,
      document_snapshot: { name: document.name, version: document.version, storagePath: document.storage_path },
      status: "PREPARING",
      sent_by: user.id,
    }).select("id").single();
    if (claimError) {
      if (claimError.code === "23505") return { ok: true as const, message: "Este envío ya está siendo procesado." };
      throw claimError;
    }
    const publicUrl = catalogPublicUrl(document.category, process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl");
    const downloaded = input.attachPdf ? await admin.storage.from("orbit-documents").download(document.storage_path) : null;
    if (downloaded?.error) throw downloaded.error;
    const signatureUrl = typeof company.emailConfiguration.signatureGifUrl === "string" ? company.emailConfiguration.signatureGifUrl : "";
    const signatureMode = commercialSignatureMode(signatureUrl);
    const signature = signatureMode === "GRAPHICAL" ? `<p style="margin:24px 0 0"><img src="${escapeHtml(signatureUrl)}" alt="BOOMBOX" style="display:block;max-width:600px;width:100%;height:auto;border:0"></p>` : `<p style="margin:8px 0 0"><strong>Equipo BOOMBOX</strong></p>`;
    const cleanBody = withoutDuplicateSignature(withoutDuplicateSignature(body, company.emailSignature || "Equipo BOOMBOX"), "Equipo BOOMBOX");
    const richText = (paragraph: string) => paragraph.split(/(\*\*[^*]+\*\*)/g).map((part) => part.startsWith("**") && part.endsWith("**") ? `<strong>${escapeHtml(part.slice(2, -2))}</strong>` : escapeHtml(part)).join("").replaceAll("\n", "<br>");
    const htmlParagraphs = quickSendBodyParagraphs(cleanBody, input.name).map((paragraph) => `<p style="margin:0 0 16px">${richText(paragraph)}</p>`).join("");
    const cta = `<p style="margin:24px 0"><a href="${escapeHtml(publicUrl)}" style="display:inline-block;background:#f78900;color:#111;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:10px;min-height:20px">${QUICK_SEND_CTA_LABEL}</a></p><p style="margin:0 0 20px;font-size:13px;color:#666">${QUICK_SEND_CTA_FALLBACK} <a href="${escapeHtml(publicUrl)}">${escapeHtml(publicUrl)}</a></p>`;
    const sent = await new GoogleGmailApiProvider(
      await loadGoogleWorkspaceAccessToken(),
    ).send({
      to: input.email.trim().toLowerCase(),
      subject,
      textBody: `${quickSendBodyParagraphs(cleanBody, input.name).join("\n\n")}\n\n${QUICK_SEND_CTA_LABEL}: ${publicUrl}\n\n${signatureMode === "GRAPHICAL" ? "" : "Equipo BOOMBOX"}`.trim(),
      htmlBody: `<main style="font-family:Arial,sans-serif;line-height:1.6;max-width:680px">${htmlParagraphs}${cta}${signature}</main>`,
      driveFileIds: [],
      attachments: downloaded?.data ? [{ filename: document.filename || `${document.name}.pdf`, mimeType: "application/pdf", content: new Uint8Array(await downloaded.data.arrayBuffer()) }] : [],
    });
    const { error: write } = await admin
      .from("commercial_sends")
      .update({
        status: "SENT",
        external_message_id: sent.messageId,
        document_snapshot: { name: document.name, version: document.version, storagePath: document.storage_path, publicUrl, deliveryMode: input.attachPdf ? "LINK_AND_ATTACHMENT" : "LINK" },
      }).eq("id", claimed.id);
    if (write) throw write;
    revalidatePath("/leads");
    return { ok: true as const, message: "Información enviada y registrada." };
  } catch (error) {
    return fail(error, "No fue posible enviar la información.");
  }
}

export async function createFormalQuoteAction(input: FormalQuoteDraft) {
  try {
    const { client, user } = await founder();
    if (!input.lines.length) throw new Error("Agrega al menos un ítem.");
    normalizeOptionalEmail(input.email, "email principal");
    normalizeOptionalEmail(input.secondaryEmail, "email secundario / CC");
    if (!input.existingCustomerId && input.saveTemporaryCustomer && !input.company.trim() && !input.contact.trim()) throw new Error("Ingresa un nombre antes de guardar el cliente.");
    const admin = createAdminClient();
    const quoteId = input.quoteId ?? input.requestId ?? crypto.randomUUID();
    let customerId = input.existingCustomerId;
    if (!customerId && input.saveTemporaryCustomer) {
      const { data, error } = await admin
        .from("customers")
        .insert({
          full_name: input.contact.trim() || input.company.trim(),
          company: input.company.trim() || null,
          rut: input.rut.trim() || null,
          email: input.email.trim() ? input.email.trim().toLowerCase() : null,
          secondary_email: normalizeOptionalEmail(input.secondaryEmail, "email secundario / CC"),
          phone: input.phone.trim() || null,
          address: input.address.trim() || null,
          metadata: { customerType: "COMPANY", source: "COMMERCIAL_QUOTE" },
          created_by: user.id,
          updated_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      customerId = data.id;
    }
    const issueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    const expiration = new Date(`${issueDate}T12:00:00Z`);
    expiration.setUTCDate(expiration.getUTCDate() + input.validityDays);
    const prepared = prepareFormalQuotePersistence(input);
    const { data: saved, error: saveError } = await client.rpc(
      "save_commercial_quote_draft",
      {
        p_quotation_id: quoteId,
        p_quote: {
          issueDate,
          customerId,
          customerSnapshot: prepared.customerSnapshot,
          commercialSnapshot: prepared.commercialSnapshot,
          expirationDate: expiration.toISOString().slice(0, 10),
          subtotal: prepared.calculation.subtotal,
          discountTotal: prepared.calculation.discount,
          taxTotal: prepared.calculation.vat,
          grandTotal: prepared.calculation.total,
          validityDays: input.validityDays,
          depositPercent: input.depositPercent,
          globalDiscountType: input.globalDiscountType,
          globalDiscountValue: input.globalDiscountValue,
        },
        p_items: prepared.items,
      },
    );
    if (saveError) throw saveError;
    const result = saved as {
      quotationId?: string;
      quotationNumber?: string;
      operation?: "CREATED" | "UPDATED";
    } | null;
    if (!result?.quotationId || !result.quotationNumber || !result.operation)
      throw new Error("La persistencia no confirmó la cotización.");
    const number = result.quotationNumber;
    const operation = result.operation;
    const correlationId = `commercial-quote:${quoteId}:${operation.toLowerCase()}:${input.requestId ?? quoteId}`;
    after(async () => {
      try {
        await admin
          .from("timeline_events")
          .upsert({
            customer_id: customerId,
            project_id: null,
            event_type: operation === "UPDATED" ? "COMMERCIAL_QUOTE_UPDATED" : "COMMERCIAL_QUOTE_DRAFTED",
            title: operation === "UPDATED" ? "Cotización comercial actualizada" : "Cotización comercial creada",
            description: `${number} fue ${operation === "UPDATED" ? "actualizada" : "guardada"} como borrador.`,
            actor_id: user.id,
            actor_label: "Founder",
            source: "Commercial Hub",
            action: operation === "UPDATED" ? "COMMERCIAL_QUOTE_UPDATED" : "COMMERCIAL_QUOTE_DRAFTED",
            entity_type: "Quotation",
            entity_id: quoteId,
            human_message: `Cotización ${number} ${operation === "UPDATED" ? "actualizada" : "creada"}.`,
            correlation_id: correlationId,
            created_by: user.id,
          }, { onConflict: "correlation_id", ignoreDuplicates: true });
      } catch (error) {
        console.error("Commercial quote audit boundary failed", error);
      }
    });
    revalidatePath("/leads");
    return {
      ok: true as const,
      id: result.quotationId,
      number,
      total: prepared.calculation.total,
      operation,
    };
  } catch (error) {
    const technical = error as { code?: string; message?: string; details?: string };
    console.error("[ORBIT][COMMERCIAL_QUOTE_SAVE]", {
      mode: input.quoteId ? "UPDATE" : "CREATE",
      quoteId: input.quoteId ?? null,
      requestId: input.requestId ?? null,
      code: technical?.code ?? "UNKNOWN",
      message: technical?.message ?? "Unknown commercial quote persistence error",
      details: technical?.details ?? null,
    });
    return fail(
      error,
      input.quoteId
        ? "No fue posible actualizar la cotización. Intenta nuevamente."
        : "No fue posible guardar la cotización. Intenta nuevamente.",
    );
  }
}

export async function sendFormalQuoteAction(input: { quoteId: string; email: string; cc?: string[]; subject: string; body: string; requestId: string; catalogDocumentId?: string }) {
  try {
    const { user } = await founder();
    const recipients = normalizeEmailRecipients({ to: input.email, cc: input.cc });
    const admin = createAdminClient();
    const [{ data: quote, error }, company] = await Promise.all([
      admin.from("quotations").select("id,quotation_number,issue_date,expiration_date,customer_id,project_id,customer_snapshot,commercial_snapshot,quotation_items(description,label,quantity,quoted_price,unit_price,total,display_order)").eq("id", input.quoteId).single(),
      loadCompanySettings(admin),
    ]);
    if (error || !quote) throw new Error("La cotización ya no está disponible.");
    const snapshot = (quote.commercial_snapshot ?? {}) as Record<string, unknown>;
    const customer = (quote.customer_snapshot ?? {}) as Record<string, string>;
    const event = (snapshot.event ?? {}) as Record<string, string>;
    const config = company.pdfConfiguration.commercialBank && typeof company.pdfConfiguration.commercialBank === "object" ? company.pdfConfiguration.commercialBank as Record<string, string> : {};
    const items = [...(quote.quotation_items ?? [])].sort((a, b) => Number(a.display_order) - Number(b.display_order));
    const configuredConditions = Array.isArray(company.pdfConfiguration.commercialReservationConditions) ? company.pdfConfiguration.commercialReservationConditions.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
    const pdf = await createFormalQuotePdf({ number: quote.quotation_number, issueDate: quote.issue_date, expirationDate: quote.expiration_date, customer, event, lines: items.map((item) => ({ description: item.description || item.label, quantity: Number(item.quantity), quotedPrice: Number(item.quoted_price ?? item.unit_price), total: Number(item.total) })), subtotal: Number(snapshot.subtotal ?? 0), discount: Number(snapshot.discount ?? 0), net: Number(snapshot.net ?? 0), tax: Number(snapshot.tax ?? 0), total: Number(snapshot.total ?? 0), deposit: Number(snapshot.deposit ?? 0), balance: Number(snapshot.balance ?? 0), depositPercent: Number(snapshot.depositPercent ?? 50), company: { legalName: company.legalName, taxId: company.taxId, address: company.address, city: company.city, phone: company.phone, email: config.email || company.salesEmail || company.supportEmail, website: company.website, bankName: config.bankName || "Banco no configurado", bankAccountType: config.accountType || "Cuenta no configurada", bankAccountNumber: config.accountNumber || "Número no configurado", importantNotice: typeof company.pdfConfiguration.commercialImportantNotice === "string" ? company.pdfConfiguration.commercialImportantNotice : undefined, reservationConditions: configuredConditions, operationalConditions: normalizeQuoteOperationalConditions(company.pdfConfiguration.commercialOperationalConditions) } });
    const pdfPath = quoteStorageKey(quote.id, quote.quotation_number);
    const upload = await admin.storage.from("orbit-documents").upload(pdfPath, pdf, { contentType: "application/pdf", upsert: true });
    if (upload.error) throw upload.error;
    const pdfUrl = await admin.storage.from("orbit-documents").createSignedUrl(pdfPath, 60 * 60 * 24 * 7);
    if (pdfUrl.error) throw pdfUrl.error;
    let catalogUrl = "";
    let catalogSnapshot: Record<string, unknown> | null = null;
    if (input.catalogDocumentId) {
      const { data: document, error: documentError } = await admin.from("commercial_documents").select("id,name,version,storage_path").eq("id", input.catalogDocumentId).eq("status", "ACTIVE").single();
      if (documentError) throw documentError;
      const signed = await admin.storage.from("orbit-documents").createSignedUrl(document.storage_path, 60 * 60 * 24 * 7);
      if (signed.error) throw signed.error;
      catalogUrl = signed.data.signedUrl;
      catalogSnapshot = { id: document.id, name: document.name, version: document.version };
    }
    const subject = normalizeEmailNewlines(input.subject || formalQuoteSubject(quote.quotation_number, customer.company || customer.contact)).replaceAll("\n", " ").trim();
    const body = normalizeEmailNewlines(input.body);
    const { data: claim, error: claimError } = await admin.from("commercial_sends").insert({ idempotency_key: input.requestId, recipient_email: recipients.to, cc_recipients: recipients.cc, category: "COMPANIES_QUOTE", quotation_id: quote.id, customer_id: quote.customer_id, project_id: quote.project_id, subject, body_snapshot: body, document_snapshot: { quote: quote.quotation_number, pdfPath, catalog: catalogSnapshot }, status: "PREPARING", sent_by: user.id }).select("id").single();
    if (claimError) {
      if (claimError.code === "23505") return { ok: true as const, message: "Este envío ya está siendo procesado." };
      throw claimError;
    }
    const links = `<p><a href="${pdfUrl.data.signedUrl}">Descargar ${escapeHtml(quote.quotation_number)}</a></p>${catalogUrl ? `<p><a href="${catalogUrl}">Ver catálogo Empresas</a></p>` : ""}`;
    const signatureUrl = typeof company.emailConfiguration.signatureGifUrl === "string" ? company.emailConfiguration.signatureGifUrl : "";
    const signatureText = "Equipo BOOMBOX";
    const signature = signatureUrl ? `<p><img src="${escapeHtml(signatureUrl)}" alt="BOOMBOX" style="display:block;max-width:600px;width:100%;height:auto;border:0"></p>` : `<p>${signatureText}</p>`;
    const cleanBody = withoutDuplicateSignature(withoutDuplicateSignature(body, company.emailSignature || signatureText), signatureText);
    const htmlParagraphs = emailParagraphs(cleanBody).map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
    const sent = await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({ to: recipients.to, cc: recipients.cc, subject, textBody: `${cleanBody}\n\nCotización: ${pdfUrl.data.signedUrl}${catalogUrl ? `\nCatálogo: ${catalogUrl}` : ""}\n\n${signatureUrl ? "" : signatureText}`.trim(), htmlBody: `<main style="font-family:Arial,sans-serif;line-height:1.6">${htmlParagraphs}${links}${signature}</main>`, driveFileIds: [], attachments: [{ filename: quoteDisplayFilename(quote.quotation_number), mimeType: "application/pdf", content: new Uint8Array(pdf) }] });
    const timestamp = new Date().toISOString();
    const { error: sendError } = await admin.from("commercial_sends").update({ status: "SENT", external_message_id: sent.messageId, sent_at: timestamp }).eq("id", claim.id);
    if (sendError) throw sendError;
    const { error: quoteError } = await admin.from("quotations").update({ status: "SENT", pdf_storage_path: pdfPath, updated_by: user.id, updated_at: timestamp }).eq("id", quote.id).eq("status", "DRAFT");
    if (quoteError) throw quoteError;
    revalidatePath("/leads");
    return { ok: true as const, message: `${quote.quotation_number} enviada y registrada.` };
  } catch (error) { return fail(error, "No fue posible enviar la cotización."); }
}

export async function acceptCommercialQuoteAction(quoteId: string) {
  try {
    const { client, role } = await founder();
    if (!["CEO", "ADMINISTRATOR"].includes(role))
      throw new Error("Solo Founder o Administración puede aceptar una cotización.");
    const { data, error } = await client.rpc(
      "accept_commercial_quote_for_reservation",
      { p_quote_id: quoteId },
    );
    if (error) throw error;
    revalidatePath("/leads");
    return {
      ok: true as const,
      message:
        (data as { status?: string } | null)?.status === "CONVERTED"
          ? "La cotización ya tiene una reserva."
          : "Cotización marcada como ACEPTADA.",
    };
  } catch (error) {
    return fail(error, "No fue posible aceptar la cotización.");
  }
}

export async function loadCommercialQuoteConversionReviewAction(
  quoteId: string,
) {
  try {
    const { client, role } = await founder();
    if (!["CEO", "ADMINISTRATOR"].includes(role))
      throw new Error("Solo Founder o Administración puede revisar la conversión.");
    const { data: quote, error } = await client
      .from("quotations")
      .select("id,status,project_id,customer_id,accepted_snapshot")
      .eq("id", quoteId)
      .is("deleted_at", null)
      .single();
    if (error) throw error;
    if (quote.status === "CONVERTED" && quote.project_id)
      return {
        ok: true as const,
        converted: true as const,
        projectId: quote.project_id,
      };
    if (quote.status !== "ACCEPTED")
      throw new Error("La cotización debe estar ACEPTADA antes de generar la reserva.");
    let snapshot = quote.accepted_snapshot;
    if (!snapshot) {
      const { data, error: snapshotError } = await client.rpc(
        "build_accepted_commercial_quote_snapshot",
        { p_quote_id: quoteId },
      );
      if (snapshotError) throw snapshotError;
      snapshot = data;
    }
    return {
      ok: true as const,
      converted: false as const,
      review: buildQuoteConversionReview({
        quoteId: quote.id,
        status: quote.status,
        projectId: quote.project_id,
        customerId: quote.customer_id,
        snapshot,
      }),
    };
  } catch (error) {
    return fail(error, "No fue posible preparar la revisión de la cotización.");
  }
}

export async function confirmCommercialQuoteConversionAction(
  formData: FormData,
) {
  try {
    const { client, user, role } = await founder();
    if (!["CEO", "ADMINISTRATOR"].includes(role))
      throw new Error("Solo Founder o Administración puede generar la reserva.");
    const quoteId = String(formData.get("quoteId") ?? "");
    const overrides: QuoteConversionOverrides = {
      name: String(formData.get("eventName") ?? ""),
      date: String(formData.get("eventDate") ?? ""),
      time: String(formData.get("eventTime") ?? ""),
      location: String(formData.get("eventLocation") ?? ""),
      city: String(formData.get("eventCity") ?? ""),
      durationHours: Number(formData.get("durationHours")),
      customerCompany: String(formData.get("customerCompany") ?? ""),
      customerRut: String(formData.get("customerRut") ?? ""),
      customerContact: String(formData.get("customerContact") ?? ""),
      customerEmail: String(formData.get("customerEmail") ?? ""),
      customerPhone: String(formData.get("customerPhone") ?? ""),
      customerAddress: String(formData.get("customerAddress") ?? ""),
    };
    const { data: prepared, error: prepareError } = await client.rpc(
      "prepare_commercial_quote_conversion",
      { p_quote_id: quoteId },
    );
    if (prepareError) throw prepareError;
    const claim = prepared as {
      status?: string;
      projectId?: string;
      transactionId?: string;
      snapshot?: unknown;
    } | null;
    if (claim?.status === "CONVERTED" && claim.projectId)
      return {
        ok: true as const,
        message: "RESERVA YA GENERADA",
        projectId: claim.projectId,
        duplicate: true,
      };
    if (!claim?.transactionId || !claim.snapshot)
      throw new Error("No fue posible obtener la transacción canónica de conversión.");
    const { data: quoteIdentity, error: identityError } = await client
      .from("quotations")
      .select("id,status,project_id,customer_id")
      .eq("id", quoteId)
      .single();
    if (identityError) throw identityError;
    const review = buildQuoteConversionReview({
      quoteId,
      status: quoteIdentity.status,
      projectId: quoteIdentity.project_id,
      customerId: quoteIdentity.customer_id,
      snapshot: claim.snapshot,
    });
    const event = assertQuoteConversionReady(review, overrides);
    const customer = resolveQuoteConversionCustomer(review, overrides);
    const items = review.items;
    const officialServicePrice = items
      .filter((item) => item.itemType === "SERVICE")
      .reduce(
        (sum, item) =>
          sum + Number(item.catalogPrice ?? item.quotedPrice) * item.quantity,
        0,
      );
    const officialExtras = items
      .filter((item) => item.itemType === "EXTRA")
      .reduce(
        (sum, item) =>
          sum + Number(item.catalogPrice ?? item.quotedPrice) * item.quantity,
        0,
      );
    const officialTransport = items
      .filter((item) => item.itemType === "TRANSPORT")
      .reduce(
        (sum, item) =>
          sum + Number(item.catalogPrice ?? item.quotedPrice) * item.quantity,
        0,
      );
    const official =
      officialServicePrice + officialExtras + officialTransport ||
      review.financial.subtotal;
    const acceptedExtras = items
      .filter((item) => item.itemType === "EXTRA")
      .reduce((sum, item) => sum + item.total, 0);
    const acceptedTransport = review.financial.customerTransportCharge;
    const acceptedService = Math.max(
      0,
      review.financial.net - acceptedExtras - acceptedTransport,
    );
    const difference = review.financial.net - official;
    const draft: ProjectDraft = {
      commercialSourceQuotationId: quoteId,
      reservationTransactionId: claim.transactionId,
      crmCustomerId: review.customerId ?? undefined,
      type: "Corporate",
      client: {
        name: customer.contact || customer.company,
        company: customer.company || undefined,
        rut: customer.rut || undefined,
        email: customer.email,
        secondaryEmail: customer.secondaryEmail,
        phone: customer.phone,
        address: customer.address || undefined,
      },
      event: {
        date: event.date,
        time: event.time,
        location: event.location,
        city: event.city,
        durationHours: Number(event.durationHours),
        extras: items
          .filter((item) => item.itemType !== "SERVICE")
          .map((item) => item.code),
      },
      services: Array.from(
        new Set(
          items
            .filter((item) => item.itemType !== "TRANSPORT")
            .map((item) => item.code),
        ),
      ),
      origin: "Other",
      notes: [
        `Reserva convertida desde ${review.number} · revisión ${review.version}.`,
        `Evento importado: ${event.name}.`,
        ...items.map(
          (item) =>
            `${item.label} · cantidad ${item.quantity} · total ${item.total}`,
        ),
        ...review.commercialConditions,
      ].join("\n"),
      commercialFormalization: { type: "INVOICE_ONLY", requiresSignature: false, documentType: "COMMERCIAL_DOCUMENT" },
      commercialAdjustment: { type: "COMMERCIAL_NEGOTIATION", mode: difference === 0 ? "OFFICIAL" : "NEGOTIATED", value: review.financial.net, reason: "Conversión de cotización comercial aceptada", internalNotes: `Fuente canónica: ${quoteId}`, subtotal: official, officialTotal: official, officialServicePrice, officialExtras, officialTransport, officialVenueSurcharge: 0, negotiatedServicePrice: acceptedService, negotiatedExtras: acceptedExtras, negotiatedTransport: acceptedTransport, negotiatedTotal: review.financial.net, difference, differencePercentage: official ? difference / official * 100 : 0, discountAmount: review.financial.discount, discountReason: "CORPORATE_AGREEMENT", commercialCharge: 0, appliedTransport: acceptedTransport, courtesyValue: 0, courtesies: [], paymentCondition: review.financial.depositPercent >= 100 ? "CASH" : "FIFTY_FIFTY", paymentTermDays: 0, paymentReceiptRequired: true, corporateCreditApproved: false, corporateVatApplied: review.financial.tax > 0, netAmount: review.financial.net, vatAmount: review.financial.tax, finalPrice: review.financial.total },
    };
    const result = await createCustomerProjectAction(draft);
    if (!result.ok) throw new Error(result.error);
    const { data: persistedProject, error: projectError } = await client
      .from("projects")
      .select("finance,operations")
      .eq("id", result.project.id)
      .single();
    if (projectError) throw projectError;
    const finance = persistedProject.finance && typeof persistedProject.finance === "object" ? persistedProject.finance as Record<string, unknown> : {};
    const operations = persistedProject.operations && typeof persistedProject.operations === "object" ? persistedProject.operations as Record<string, unknown> : {};
    const { error: snapshotWriteError } = await client
      .from("projects")
      .update({
        name: event.name,
        finance: {
          ...finance,
          acceptedQuote: {
            quotationId: quoteId,
            quotationNumber: review.number,
            revision: review.version,
            acceptedAt: review.acceptedAt,
            ...review.financial,
          },
        },
        operations: {
          ...operations,
          commercialOrigin: {
            quotationId: quoteId,
            event,
            acceptedItems: items,
          },
        },
        updated_by: user.id,
      })
      .eq("id", result.project.id);
    if (snapshotWriteError) throw snapshotWriteError;
    for (const item of items.filter(
      (entry) => entry.itemType !== "TRANSPORT",
    )) {
      const { error: quantityError } = await client
        .from("project_services")
        .upsert(
          {
            project_id: result.project.id,
            service_code: item.code,
            quantity: item.quantity,
            duration_hours: Number(event.durationHours),
            extras: draft.event.extras ?? [],
          },
          { onConflict: "project_id,service_code" },
        );
      if (quantityError) throw quantityError;
    }
    const { error: finalizeError } = await client.rpc(
      "finalize_commercial_quote_conversion",
      {
        p_quote_id: quoteId,
        p_transaction_id: claim.transactionId,
        p_project_id: result.project.id,
        p_review: { event, reviewedAt: new Date().toISOString() },
      },
    );
    if (finalizeError) throw finalizeError;
    const warnings: string[] = [];
    const ocFile = formData.get("purchaseOrderFile");
    if (ocFile instanceof File && ocFile.size) {
      const purchaseOrder = new FormData();
      purchaseOrder.set("projectId", result.project.id);
      purchaseOrder.set(
        "purchaseOrderNumber",
        String(formData.get("purchaseOrderNumber") ?? ""),
      );
      purchaseOrder.set("file", ocFile);
      const oc = await attachCustomerPurchaseOrderAction(purchaseOrder);
      if (!oc.ok) warnings.push(`OC Cliente: ${oc.error}`);
      else if (oc.warning) warnings.push(oc.warning);
    }
    try {
      const drive = await archiveAcceptedQuoteForProject({
        quoteId,
        projectId: result.project.id,
      });
      if (!drive.archived)
        warnings.push("La cotización permanece protegida en ORBIT y su archivo Drive está pendiente.");
    } catch (driveError) {
      warnings.push("La reserva fue creada; el archivo administrativo de la cotización en Drive queda pendiente.");
      console.error("[ORBIT][ACCEPTED_QUOTE_DRIVE_ARCHIVE]", driveError);
    }
    revalidatePath("/leads"); revalidatePath(`/projects/${result.project.id}`);
    return {
      ok: true as const,
      message: warnings.length
        ? `Reserva creada. ${warnings.join(" ")}`
        : "Reserva creada desde la cotización aceptada mediante el pipeline único.",
      projectId: result.project.id,
      duplicate: Boolean(result.project.reservationResumed),
    };
  } catch (error) {
    return fail(error, "No fue posible convertir la cotización.");
  }
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
