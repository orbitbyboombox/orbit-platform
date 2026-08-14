"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import type { CommercialCategory, FormalQuoteDraft } from "./types";
import { calculateFormalQuote, isCommercialEmail } from "./quote-calculation";
import { createFormalQuotePdf } from "./formal-quote-pdf";
import { loadCompanySettings } from "@/features/company-settings";
import { createCustomerProjectAction } from "@/features/projects/actions/customer.actions";
import type { ProjectDraft } from "@/features/projects/types/project";
import { emailParagraphs, formalQuoteSubject, normalizeEmailNewlines, quoteDisplayFilename, quoteStorageKey, withoutDuplicateSignature } from "./presentation";

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
  return { client, user: data.user };
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
      .select("id,name,version,filename,storage_path,status")
      .eq("id", input.documentId)
      .eq("status", "ACTIVE")
      .single();
    if (error || !document)
      throw new Error("El documento comercial ya no está disponible.");
    const vars = {
      Nombre: input.name.trim() || "",
      Empresa: input.name.trim() || "",
    };
    const subject = normalizeEmailNewlines(replace(input.subject, vars)).replaceAll("\n", " ").trim(),
      body = normalizeEmailNewlines(replace(input.body, vars));
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
    const [signed, downloaded] = await Promise.all([admin.storage
      .from("orbit-documents")
      .createSignedUrl(document.storage_path, 60 * 30), admin.storage.from("orbit-documents").download(document.storage_path)]);
    if (signed.error) throw signed.error;
    if (downloaded.error) throw downloaded.error;
    const signatureUrl = typeof company.emailConfiguration.signatureGifUrl === "string" ? company.emailConfiguration.signatureGifUrl : "";
    const signature = signatureUrl ? `<p><img src="${escapeHtml(signatureUrl)}" alt="Equipo BOOMBOX" style="display:block;max-width:420px;width:100%;height:auto"></p>` : `<p>${escapeHtml(company.emailSignature || "Equipo BOOMBOX")}</p>`;
    const cleanBody = withoutDuplicateSignature(body, company.emailSignature || "Equipo BOOMBOX");
    const htmlParagraphs = emailParagraphs(cleanBody).map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
    const sent = await new GoogleGmailApiProvider(
      await loadGoogleWorkspaceAccessToken(),
    ).send({
      to: input.email.trim().toLowerCase(),
      subject,
      textBody: `${cleanBody}\n\nDocumento: ${signed.data.signedUrl}\n\n${signatureUrl ? "" : company.emailSignature || "Equipo BOOMBOX"}`.trim(),
      htmlBody: `<main style="font-family:Arial,sans-serif;line-height:1.6">${htmlParagraphs}<p><a href="${signed.data.signedUrl}">Ver ${escapeHtml(document.name)}</a></p>${signature}</main>`,
      driveFileIds: [],
      attachments: [{ filename: document.filename || `${document.name}.pdf`, mimeType: "application/pdf", content: new Uint8Array(await downloaded.data.arrayBuffer()) }],
    });
    const { error: write } = await admin
      .from("commercial_sends")
      .update({
        status: "SENT",
        external_message_id: sent.messageId,
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
    const { user } = await founder();
    if (!input.lines.length) throw new Error("Agrega al menos un ítem.");
    if (!input.existingCustomerId && input.saveTemporaryCustomer && !input.company.trim() && !input.contact.trim()) throw new Error("Ingresa un nombre antes de guardar el cliente.");
    const admin = createAdminClient();
    let customerId = input.existingCustomerId;
    if (!customerId && input.saveTemporaryCustomer) {
      const { data, error } = await admin
        .from("customers")
        .insert({
          full_name: input.contact.trim() || input.company.trim(),
          company: input.company.trim() || null,
          rut: input.rut.trim() || null,
          email: input.email.trim() ? input.email.trim().toLowerCase() : null,
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
    const issueDate = new Date().toISOString().slice(0, 10);
    const expiration = new Date(`${issueDate}T12:00:00Z`);
    expiration.setUTCDate(expiration.getUTCDate() + input.validityDays);
    let number: string;
    if (input.quoteId) {
      const { data: existing, error: existingError } = await admin.from("quotations").select("quotation_number,status").eq("id", input.quoteId).single();
      if (existingError) throw existingError;
      if (existing.status !== "DRAFT") throw new Error("Solo un borrador puede editarse.");
      number = existing.quotation_number;
    } else {
      const { data: nextNumber, error: numberError } = await admin.rpc("next_commercial_quote_number", { p_issue_date: issueDate });
      if (numberError) throw numberError;
      number = nextNumber;
    }
    const calculation = calculateFormalQuote(
      input.lines,
      input.globalDiscountType,
      input.globalDiscountValue,
      input.depositPercent,
    );
    const normalized = input.lines.map((line, index) => ({
      ...line,
      order: index,
      total: calculation.lineTotals[index],
    }));
    const subtotal = calculation.subtotal;
    const globalDiscount = calculation.discount;
    const net = calculation.net;
    const tax = calculation.vat;
    const total = calculation.total;
    const snapshot = {
      customer: {
        company: input.company,
        rut: input.rut,
        contact: input.contact,
        email: input.email,
        phone: input.phone,
        address: input.address,
      },
      event: { name: input.eventName, date: input.eventDate, time: input.eventTime, location: input.eventLocation, city: input.eventCity },
      lines: normalized,
      subtotal,
      discount: globalDiscount,
      net,
      tax,
      total,
      depositPercent: input.depositPercent,
      deposit: calculation.deposit,
      balance: calculation.balance,
      validityDays: input.validityDays,
    };
    const itemPayload = normalized.map((line) => ({
      itemType: line.manual ? "EXTRA" : line.code.includes("TRANSPORT") ? "TRANSPORT" : "SERVICE",
      code: line.code, description: line.description, quantity: line.quantity, quotedPrice: line.quotedPrice,
      total: line.total, catalogPrice: line.catalogPrice, discountType: line.discountType,
      discountValue: line.discountValue, displayOrder: line.order, manual: line.manual,
      metadata: { catalogOverride: line.catalogPrice != null && line.catalogPrice !== line.quotedPrice },
    }));
    let quoteId = input.quoteId;
    if (quoteId) {
      const { error: updateError } = await admin.rpc("update_commercial_quote_draft", {
        p_quotation_id: quoteId,
        p_quote: { customerId, customerSnapshot: snapshot.customer, commercialSnapshot: snapshot, expirationDate: expiration.toISOString().slice(0, 10), subtotal, discountTotal: globalDiscount, taxTotal: tax, grandTotal: total, validityDays: input.validityDays, depositPercent: input.depositPercent, globalDiscountType: input.globalDiscountType, globalDiscountValue: input.globalDiscountValue },
        p_items: itemPayload,
      });
      if (updateError) throw updateError;
    } else {
      const { data: quote, error } = await admin
      .from("quotations")
      .insert({
        quotation_number: number,
        customer_id: customerId,
        project_id: null,
        orbit_event_id: null,
        status: "DRAFT",
        customer_type: "COMPANY",
        event_type: "CORPORATE",
        issue_date: issueDate,
        expiration_date: expiration.toISOString().slice(0, 10),
        currency: "CLP",
        subtotal,
        transport_total: 0,
        discount_total: globalDiscount,
        tax_total: tax,
        grand_total: total,
        official_price: total,
        final_customer_price: total,
        price_difference: 0,
        customer_snapshot: snapshot.customer,
        commercial_snapshot: snapshot,
        pricing_snapshot: snapshot,
        validity_days: input.validityDays,
        deposit_percent: input.depositPercent,
        global_discount_type: input.globalDiscountType,
        global_discount_value: input.globalDiscountValue,
        blockers: [],
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();
      if (error) throw error;
      quoteId = quote.id;
      const { error: itemError } = await admin
      .from("quotation_items")
      .insert(
        normalized.map((line) => ({
          quotation_id: quoteId,
          item_type: line.manual
            ? "EXTRA"
            : line.code.includes("TRANSPORT")
              ? "TRANSPORT"
              : "SERVICE",
          code: line.code,
          label: line.description,
          description: line.description,
          quantity: line.quantity,
          unit_price: line.quotedPrice,
          total: line.total,
          official_unit_price: line.catalogPrice ?? line.quotedPrice,
          official_total:
            (line.catalogPrice ?? line.quotedPrice) * line.quantity,
          final_unit_price: line.quotedPrice,
          final_total: line.total,
          catalog_price: line.catalogPrice,
          quoted_price: line.quotedPrice,
          discount_type: line.discountType,
          discount_value: line.discountValue,
          display_order: line.order,
          is_manual: line.manual,
          metadata: {
            catalogOverride:
              line.catalogPrice != null &&
              line.catalogPrice !== line.quotedPrice,
          },
        })),
      );
      if (itemError) {
        await admin.from("quotations").delete().eq("id", quoteId);
        throw itemError;
      }
    }
    after(async () => {
      try {
        await admin
          .from("timeline_events")
          .insert({
            customer_id: customerId,
            project_id: null,
            event_type: "COMMERCIAL_QUOTE_DRAFTED",
            title: "Cotización comercial creada",
            description: `${number} fue guardada como borrador.`,
            actor_id: user.id,
            actor_label: "Founder",
            source: "Commercial Hub",
            action: "COMMERCIAL_QUOTE_DRAFTED",
            entity_type: "Quotation",
            entity_id: quoteId,
            human_message: `Cotización ${number} creada.`,
            correlation_id: `commercial-quote:${quoteId}`,
            created_by: user.id,
          });
      } catch (error) {
        console.error("Commercial quote audit boundary failed", error);
      }
    });
    revalidatePath("/leads");
    return { ok: true as const, id: quoteId!, number, total };
  } catch (error) {
    return fail(error, "No fue posible crear la cotización.");
  }
}

export async function sendFormalQuoteAction(input: { quoteId: string; email: string; subject: string; body: string; requestId: string; catalogDocumentId?: string }) {
  try {
    const { user } = await founder();
    if (!isCommercialEmail(input.email)) throw new Error("Ingresa un correo válido.");
    const admin = createAdminClient();
    const [{ data: quote, error }, company] = await Promise.all([
      admin.from("quotations").select("id,quotation_number,issue_date,expiration_date,customer_snapshot,commercial_snapshot,quotation_items(description,label,quantity,quoted_price,unit_price,total,display_order)").eq("id", input.quoteId).single(),
      loadCompanySettings(admin),
    ]);
    if (error || !quote) throw new Error("La cotización ya no está disponible.");
    const snapshot = (quote.commercial_snapshot ?? {}) as Record<string, unknown>;
    const customer = (quote.customer_snapshot ?? {}) as Record<string, string>;
    const event = (snapshot.event ?? {}) as Record<string, string>;
    const config = company.pdfConfiguration.commercialBank && typeof company.pdfConfiguration.commercialBank === "object" ? company.pdfConfiguration.commercialBank as Record<string, string> : {};
    const items = [...(quote.quotation_items ?? [])].sort((a, b) => Number(a.display_order) - Number(b.display_order));
    const configuredConditions = Array.isArray(company.pdfConfiguration.commercialReservationConditions) ? company.pdfConfiguration.commercialReservationConditions.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
    const pdf = await createFormalQuotePdf({ number: quote.quotation_number, issueDate: quote.issue_date, expirationDate: quote.expiration_date, customer, event, lines: items.map((item) => ({ description: item.description || item.label, quantity: Number(item.quantity), quotedPrice: Number(item.quoted_price ?? item.unit_price), total: Number(item.total) })), subtotal: Number(snapshot.subtotal ?? 0), discount: Number(snapshot.discount ?? 0), net: Number(snapshot.net ?? 0), tax: Number(snapshot.tax ?? 0), total: Number(snapshot.total ?? 0), deposit: Number(snapshot.deposit ?? 0), balance: Number(snapshot.balance ?? 0), depositPercent: Number(snapshot.depositPercent ?? 50), company: { legalName: company.legalName, taxId: company.taxId, address: company.address, city: company.city, phone: company.phone, email: config.email || company.salesEmail || company.supportEmail, website: company.website, bankName: config.bankName || "Banco no configurado", bankAccountType: config.accountType || "Cuenta no configurada", bankAccountNumber: config.accountNumber || "Número no configurado", reservationConditions: configuredConditions } });
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
    const { data: claim, error: claimError } = await admin.from("commercial_sends").insert({ idempotency_key: input.requestId, recipient_email: input.email.trim().toLowerCase(), category: "COMPANIES_QUOTE", quotation_id: quote.id, subject, body_snapshot: body, document_snapshot: { quote: quote.quotation_number, pdfPath, catalog: catalogSnapshot }, status: "PREPARING", sent_by: user.id }).select("id").single();
    if (claimError) {
      if (claimError.code === "23505") return { ok: true as const, message: "Este envío ya está siendo procesado." };
      throw claimError;
    }
    const links = `<p><a href="${pdfUrl.data.signedUrl}">Descargar ${escapeHtml(quote.quotation_number)}</a></p>${catalogUrl ? `<p><a href="${catalogUrl}">Ver catálogo Empresas</a></p>` : ""}`;
    const signatureUrl = typeof company.emailConfiguration.signatureGifUrl === "string" ? company.emailConfiguration.signatureGifUrl : "";
    const signatureText = company.emailSignature || "Equipo BOOMBOX";
    const signature = signatureUrl ? `<p><img src="${escapeHtml(signatureUrl)}" alt="Equipo BOOMBOX" style="display:block;max-width:420px;width:100%;height:auto"></p>` : `<p>${escapeHtml(signatureText)}</p>`;
    const cleanBody = withoutDuplicateSignature(body, signatureText);
    const htmlParagraphs = emailParagraphs(cleanBody).map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
    const sent = await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({ to: input.email.trim().toLowerCase(), subject, textBody: `${cleanBody}\n\nCotización: ${pdfUrl.data.signedUrl}${catalogUrl ? `\nCatálogo: ${catalogUrl}` : ""}\n\n${signatureUrl ? "" : signatureText}`.trim(), htmlBody: `<main style="font-family:Arial,sans-serif;line-height:1.6">${htmlParagraphs}${links}${signature}</main>`, driveFileIds: [], attachments: [{ filename: quoteDisplayFilename(quote.quotation_number), mimeType: "application/pdf", content: new Uint8Array(pdf) }] });
    const timestamp = new Date().toISOString();
    const { error: sendError } = await admin.from("commercial_sends").update({ status: "SENT", external_message_id: sent.messageId, sent_at: timestamp }).eq("id", claim.id);
    if (sendError) throw sendError;
    const { error: quoteError } = await admin.from("quotations").update({ status: "SENT", pdf_storage_path: pdfPath, updated_by: user.id, updated_at: timestamp }).eq("id", quote.id).eq("status", "DRAFT");
    if (quoteError) throw quoteError;
    revalidatePath("/leads");
    return { ok: true as const, message: `${quote.quotation_number} enviada y registrada.` };
  } catch (error) { return fail(error, "No fue posible enviar la cotización."); }
}

export async function convertCommercialQuoteAction(quoteId: string) {
  try {
    const { user } = await founder();
    const admin = createAdminClient();
    const { data: quote, error } = await admin.from("quotations").select("id,status,customer_id,customer_snapshot,commercial_snapshot,quotation_items(code,catalog_price,quoted_price,quantity,is_manual)").eq("id", quoteId).single();
    if (error) throw error;
    if (quote.status === "CONVERTED") return { ok: true as const, message: "Esta cotización ya fue convertida." };
    if (!["SENT", "VIEWED", "ACCEPTED"].includes(quote.status)) throw new Error("Primero envía la cotización al cliente.");
    const snapshot = quote.commercial_snapshot as Record<string, unknown>;
    const customer = quote.customer_snapshot as Record<string, string>;
    const event = (snapshot.event ?? {}) as Record<string, string>;
    if (!event.date || !event.time || !event.location || !event.city) throw new Error("Completa fecha, hora, dirección y comuna antes de convertir.");
    const items = quote.quotation_items ?? [];
    const net = Number(snapshot.net ?? 0), vat = Number(snapshot.tax ?? 0), total = Number(snapshot.total ?? 0);
    const official = items.reduce((sum, item) => sum + Number(item.catalog_price ?? item.quoted_price ?? 0) * Number(item.quantity), 0);
    const difference = net - official;
    const draft: ProjectDraft = {
      commercialSourceQuotationId: quote.id,
      reservationTransactionId: crypto.randomUUID(),
      crmCustomerId: quote.customer_id ?? undefined,
      type: "Corporate",
      client: { name: customer.contact || customer.company, company: customer.company || undefined, rut: customer.rut || undefined, email: customer.email || "", phone: customer.phone || "", address: customer.address || undefined },
      event: { date: event.date, time: event.time, location: event.location, city: event.city, durationHours: 2, extras: items.filter((item) => !item.is_manual).map((item) => item.code) },
      services: items.filter((item) => !item.is_manual).map((item) => item.code),
      origin: "Other",
      notes: `Reserva convertida desde cotización ${quote.id}.\n${items.filter((item) => item.is_manual).map((item) => `Ítem especial: ${item.code}`).join("\n")}`,
      commercialFormalization: { type: "INVOICE_ONLY", requiresSignature: false, documentType: "COMMERCIAL_DOCUMENT" },
      commercialAdjustment: { type: "COMMERCIAL_NEGOTIATION", mode: difference === 0 ? "OFFICIAL" : "NEGOTIATED", value: net, reason: "Conversión de cotización comercial aceptada", internalNotes: `Fuente canónica: ${quote.id}`, subtotal: official, officialTotal: official, officialServicePrice: official, officialExtras: 0, officialTransport: 0, officialVenueSurcharge: 0, negotiatedServicePrice: net, negotiatedExtras: 0, negotiatedTransport: 0, negotiatedTotal: net, difference, differencePercentage: official ? difference / official * 100 : 0, discountAmount: Number(snapshot.discount ?? 0), discountReason: "CORPORATE_AGREEMENT", commercialCharge: 0, appliedTransport: 0, courtesyValue: 0, courtesies: [], paymentCondition: "FIFTY_FIFTY", paymentTermDays: 0, paymentReceiptRequired: true, corporateCreditApproved: false, corporateVatApplied: true, netAmount: net, vatAmount: vat, finalPrice: total },
    };
    const acceptedAt = new Date().toISOString();
    const { error: acceptError } = await admin.from("quotations").update({ status: "ACCEPTED", approved_by: user.id, approved_at: acceptedAt, approval_reason: "Aceptada para conversión en reserva", updated_by: user.id }).eq("id", quote.id).in("status", ["SENT", "VIEWED", "ACCEPTED"]);
    if (acceptError) throw acceptError;
    const result = await createCustomerProjectAction(draft);
    if (!result.ok) throw new Error(result.error);
    const { data: projectIdentity, error: projectIdentityError } = await admin.from("projects").select("customer_id,orbit_event_id").eq("id", result.project.id).single();
    if (projectIdentityError) throw projectIdentityError;
    const { error: convertedError } = await admin.from("quotations").update({ status: "CONVERTED", customer_id: projectIdentity.customer_id, project_id: result.project.id, orbit_event_id: projectIdentity.orbit_event_id, converted_at: new Date().toISOString(), updated_by: user.id }).eq("id", quote.id);
    if (convertedError) throw convertedError;
    revalidatePath("/leads"); revalidatePath(`/projects/${result.project.id}`);
    return { ok: true as const, message: "Cotización convertida mediante el pipeline único de Reserva.", projectId: result.project.id };
  } catch (error) { return fail(error, "No fue posible convertir la cotización."); }
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
