"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { renderPremiumQuotationEmail } from "@/features/connectors/google-gmail/application/boombox-premium-quotation-email.html";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import type { CommercialCategory, FormalQuoteDraft } from "./types";
import { isCommercialEmail } from "./quote-calculation";
import { executeCanonicalQuoteDraft } from "./canonical-quote.service";
import { createFormalQuotePdf } from "./formal-quote-pdf";
import { resolveCommercialBreakdown } from "./commercial-breakdown";
import { loadCompanySettings } from "@/features/company-settings";
import { createCustomerProjectAction } from "@/features/projects/actions/customer.actions";
import type { ProjectDraft } from "@/features/projects/types/project";
import { emailParagraphs, formalQuoteSubject, normalizeEmailNewlines, quoteDisplayFilename, quoteStorageKey, resolveQuickSendBody, withoutDuplicateSignature } from "./presentation";
import { catalogCategoryForQuickSend, catalogPublicUrl, isCommercialCatalogCategory } from "./catalogs";
import { normalizeQuoteOperationalConditions } from "./operational-conditions";
import { normalizeEmailRecipients, normalizeOptionalEmail } from "@/lib/email/recipients";
import { attachCustomerPurchaseOrderAction } from "@/features/commercial-documents/actions";
import { archiveAcceptedQuoteForProject } from "@/features/commercial-documents/drive-archive";
import { buildSocialPlansEmail } from "./social-plans-email";
import { buildGmailAcceptancePatch, isCommercialSendAccepted } from "./commercial-delivery-ledger";
import {
  assertQuoteConversionReady,
  buildQuoteConversionReview,
  resolveQuoteConversionCustomer,
  resolveQuoteConversionPaymentTerms,
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
export type QuoteConversionWarning = {
  integration: string;
  detail: string;
};
const conversionSuccess = (
  projectId: string,
  duplicate: boolean,
  warnings: QuoteConversionWarning[] = [],
) => ({
  ok: true as const,
  message: "✓ Reserva creada correctamente" as const,
  customerConfirmationMessage: "Confirmación cliente pendiente de envío" as const,
  projectId,
  duplicate,
  warnings,
});
const conversionWarning = (
  warnings: QuoteConversionWarning[],
  integration: string,
  error: unknown,
) => {
  const detail = error instanceof Error ? error.message : String(error);
  warnings.push({ integration, detail });
  console.error(
    JSON.stringify({
      level: "error",
      event: "commercial_quote.post_commit_integration_pending",
      integration,
      detail,
      timestamp: new Date().toISOString(),
    }),
  );
};

async function recoverCommittedQuoteConversion(
  quoteId: string,
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const { data: quote, error } = await client
    .from("quotations")
    .select("id,status,project_id,conversion_transaction_id")
    .eq("id", quoteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !quote?.project_id) return null;
  const { data: project, error: projectError } = await client
    .from("projects")
    .select("id")
    .eq("id", quote.project_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (projectError || !project) return null;
  const warnings: QuoteConversionWarning[] = [];
  if (quote.status !== "CONVERTED" && quote.conversion_transaction_id) {
    const { data: transaction } = await client
      .from("reservation_transactions")
      .select("status,project_id")
      .eq("id", quote.conversion_transaction_id)
      .maybeSingle();
    if (transaction?.status === "COMPLETED" && transaction.project_id === project.id) {
      const { error: finalizeError } = await client.rpc(
        "finalize_commercial_quote_conversion",
        {
          p_quote_id: quoteId,
          p_transaction_id: quote.conversion_transaction_id,
          p_project_id: project.id,
          p_review: {
            recovery: true,
            reviewedAt: new Date().toISOString(),
          },
        },
      );
      if (finalizeError)
        conversionWarning(warnings, "Vinculación comercial", finalizeError);
    }
  }
  return conversionSuccess(project.id, true, warnings);
}

export async function recoverCommercialQuoteConversionAction(quoteId: string) {
  try {
    const { client, role } = await founder();
    if (!['CEO', 'ADMINISTRATOR'].includes(role))
      throw new Error("Solo Founder o Administración puede recuperar la conversión.");
    const recovered = await recoverCommittedQuoteConversion(quoteId, client);
    return recovered ?? { ok: false as const, error: "La reserva todavía no está confirmada." };
  } catch (error) {
    return fail(error, "No fue posible verificar la reserva.");
  }
}
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
  let acceptedMessage: { messageId: string; threadId: string } | null = null;
  let acceptedProviderAccount: string | undefined;
  const admin = createAdminClient();
  try {
    const { user } = await founder();
    if (!isCommercialEmail(input.email))
      throw new Error("Ingresa un correo válido.");
    if (!input.documentId)
      throw new Error("No existe un documento ACTIVE para esta categoría.");
    const [company, workspace] = await Promise.all([loadCompanySettings(admin), loadGoogleWorkspaceConnection()]);
    const senderEmail = workspace.workspaceAccount?.trim();
    if (!senderEmail) throw new Error("La cuenta remitente de Google Workspace no está identificada.");
    acceptedProviderAccount = senderEmail;
    const { data: existing } = await admin.from("commercial_sends").select("status").eq("idempotency_key", input.requestId).maybeSingle();
    if (isCommercialSendAccepted(existing?.status)) return { ok: true as const, message: "Este envío ya fue aceptado por Gmail." };
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
      from_email: senderEmail,
      reply_to_email: typeof company.emailConfiguration.replyTo === "string" ? company.emailConfiguration.replyTo : senderEmail,
      mime_mode: "multipart/alternative",
      attempt_count: 0,
    }).select("id").single();
    if (claimError) {
      if (claimError.code === "23505") return { ok: true as const, message: "Este envío ya está siendo procesado." };
      throw claimError;
    }
    const publicUrl = catalogPublicUrl(document.category, process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl");
    const appOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bbox.cl").replace(/\/$/, "");
    const transportUrl = `${appOrigin}/traslados?type=${input.category === "COMPANIES_CATALOG" ? "company" : "private"}`;
    const transportLabel = input.category === "COMPANIES_CATALOG"
      ? "CONOCER VALOR DE TRASLADO + IVA"
      : "CONOCER VALOR DE TRASLADO";
    const downloaded = input.attachPdf ? await admin.storage.from("orbit-documents").download(document.storage_path) : null;
    if (downloaded?.error) throw downloaded.error;
    const signatureUrl = typeof company.emailConfiguration.signatureGifUrl === "string" ? company.emailConfiguration.signatureGifUrl : "";
    const cleanBody = withoutDuplicateSignature(withoutDuplicateSignature(body, company.emailSignature || "Equipo BOOMBOX"), "Equipo BOOMBOX");
    // All catalog categories use the approved premium design, including Companies Catalog.
    // The separate formal/manual company quotation flow remains unchanged.
    const socialEmail = buildSocialPlansEmail({
      category: input.category,
      body: cleanBody,
      contact: input.name,
      website: company.website,
      catalogUrl: publicUrl,
      transportUrl,
      transportLabel,
      attachmentFilename: downloaded?.data
        ? document.filename || `${document.name}.pdf`
        : undefined,
      signatureUrl,
    });
    const htmlBody = socialEmail.html;
    acceptedMessage = await new GoogleGmailApiProvider(
      await loadGoogleWorkspaceAccessToken(),
    ).send({
      to: input.email.trim().toLowerCase(),
      from: senderEmail,
      replyTo: typeof company.emailConfiguration.replyTo === "string" && company.emailConfiguration.replyTo.trim() ? company.emailConfiguration.replyTo : senderEmail,
      subject,
      textBody: socialEmail.text,
      htmlBody,
      driveFileIds: [],
      attachments: downloaded?.data ? [{ filename: document.filename || `${document.name}.pdf`, mimeType: "application/pdf", content: new Uint8Array(await downloaded.data.arrayBuffer()) }] : [],
    });
    const { error: write } = await admin
      .from("commercial_sends")
      .update({
        status: "GMAIL_ACCEPTED",
        external_message_id: acceptedMessage.messageId,
        provider_thread_id: acceptedMessage.threadId,
        provider_account: senderEmail,
        provider_accepted_at: new Date().toISOString(),
        provider_response: { accepted: true, messageId: acceptedMessage.messageId, threadId: acceptedMessage.threadId },
        attempt_count: 1,
        document_snapshot: { name: document.name, version: document.version, storagePath: document.storage_path, publicUrl, deliveryMode: input.attachPdf ? "LINK_AND_ATTACHMENT" : "LINK" },
      }).eq("id", claimed.id);
    if (write) throw write;
    revalidatePath("/leads");
    return { ok: true as const, message: "Información enviada y registrada." };
  } catch (error) {
    if (acceptedMessage) {
      await admin.from("commercial_sends").update(buildGmailAcceptancePatch(acceptedMessage, acceptedProviderAccount, new Date().toISOString(), true)).eq("idempotency_key", input.requestId);
    }
    return fail(error, "No fue posible enviar la información.");
  }
}

export async function createFormalQuoteAction(input: FormalQuoteDraft) {
  try {
    const { client, user } = await founder();
    if (!input.lines.length) throw new Error("Agrega al menos un ítem.");
    if (input.paymentCondition === "CORPORATE_CREDIT" && (!Number.isInteger(input.paymentTermDays) || Number(input.paymentTermDays) <= 0))
      throw new Error("El crédito Empresa requiere un plazo positivo en días.");
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
    const result = await executeCanonicalQuoteDraft({
      client,
      draft: { ...input, requestId: quoteId },
      customerId,
      actor: { actorType: "HUMAN", actorId: "HUMAN_USER", source: "FOUNDER_UI" },
    });
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
      total: result.total,
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
      technical?.code === "22023" && technical?.message?.includes("motivo de negociación")
        ? "El precio difiere del precio oficial. Ingresa un motivo de negociación para guardar el cambio."
        : input.quoteId
          ? "No fue posible actualizar la cotización. Intenta nuevamente."
          : "No fue posible guardar la cotización. Intenta nuevamente.",
    );
  }
}

export async function duplicateCommercialQuoteAction(input: {
  quoteId: string;
  requestId: string;
  customerId?: string | null;
  event?: { name?: string; date?: string; time?: string; location?: string; city?: string };
}) {
  try {
    const { client } = await founder();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId))
      throw new Error("Clave de operación inválida.");
    const { data, error } = await client.rpc("duplicate_commercial_quote", {
      p_source_quote_id: input.quoteId,
      p_request_id: input.requestId,
      p_customer_id: input.customerId || null,
      p_event_overrides: input.event ?? {},
    });
    if (error) throw error;
    const result = data as { quotationId?: string; quotationNumber?: string } | null;
    if (!result?.quotationId || !result.quotationNumber)
      throw new Error("La duplicación no fue confirmada.");
    revalidatePath("/leads");
    return { ok: true as const, id: result.quotationId, number: result.quotationNumber };
  } catch (error) {
    return fail(error, "No fue posible duplicar la cotización.");
  }
}

export async function prepareCommercialQuoteRevisionAction(quoteId: string) {
  try {
    const { client } = await founder();
    const { data, error } = await client.rpc("prepare_commercial_quote_revision", {
      p_quote_id: quoteId,
      p_reason: "Modificación comercial preparada por Founder.",
    });
    if (error) throw error;
    const result = data as { quoteId?: string; version?: number } | null;
    if (!result?.quoteId) throw new Error("La revisión no fue confirmada.");
    revalidatePath(`/quotes/${quoteId}`);
    revalidatePath("/leads");
    return { ok: true as const, version: result.version ?? null };
  } catch (error) {
    return fail(error, "No fue posible preparar la modificación comercial.");
  }
}

export async function sendFormalQuoteAction(input: { quoteId: string; email: string; cc?: string[]; subject: string; body: string; requestId: string; catalogDocumentId?: string }) {
  let acceptedMessage: { messageId: string; threadId: string } | null = null;
  let acceptedProviderAccount: string | undefined;
  const admin = createAdminClient();
  let stage = "QUOTE_SEND_LOAD";
  try {
    const { client, user } = await founder();
    if (!/^[0-9a-f-]{36}$/i.test(input.requestId)) throw new Error("Clave de envío inválida.");
    const recipients = normalizeEmailRecipients({ to: input.email, cc: input.cc });
    const { data: existingSend, error: existingSendError } = await client.from("commercial_sends")
      .select("status,quotation_id").eq("idempotency_key", input.requestId).maybeSingle();
    if (existingSendError) throw existingSendError;
    if (existingSend && existingSend.quotation_id !== input.quoteId) throw new Error("La clave de envío pertenece a otra cotización.");
    if (isCommercialSendAccepted(existingSend?.status)) return { ok: true as const, message: "Este envío ya fue aceptado por Gmail." };
    if (existingSend?.status === "PREPARING") return { ok: true as const, message: "Este envío ya está siendo procesado." };

    stage = "QUOTE_SEND_VERSION";
    const { data: versionId, error: ensureVersionError } = await client.rpc("ensure_current_quote_version", {
      p_quote_id: input.quoteId,
      p_actor: user.id,
    });
    if (ensureVersionError) throw ensureVersionError;
    const { data: currentVersion, error: currentVersionError } = await client.from("quote_versions")
      .select("id,version_number,pdf_storage_path").eq("quote_id", input.quoteId).eq("id", versionId).single();
    if (currentVersionError || !currentVersion) throw currentVersionError ?? new Error("La versión vigente no está disponible.");
    const version = currentVersion.version_number;

    stage = "QUOTE_SEND_LOAD";
    const [{ data: quote, error }, company, workspace] = await Promise.all([
      client.from("quotations").select("id,status,updated_at,quotation_number,issue_date,expiration_date,customer_id,project_id,customer_snapshot,commercial_snapshot,pricing_snapshot,quotation_items(description,label,quantity,quoted_price,unit_price,total,item_type,display_order)").eq("id", input.quoteId).eq("current_version_id", currentVersion.id).is("deleted_at", null).single(),
      loadCompanySettings(admin),
      loadGoogleWorkspaceConnection(),
    ]);
    const senderEmail = workspace.workspaceAccount?.trim();
    if (!senderEmail) throw new Error("La cuenta remitente de Google Workspace no está identificada.");
    acceptedProviderAccount = senderEmail;
    if (error || !quote) throw error ?? new Error("La cotización ya no está disponible.");
    if (!["DRAFT", "NEGOTIATION", "SENT", "VIEWED"].includes(quote.status)) throw new Error("El estado de la cotización no permite este envío. Para una versión aceptada, utiliza el reenvío del original.");
    const pricingSnapshot = (quote.pricing_snapshot ?? {}) as Record<string, unknown>;
    const snapshot = (quote.commercial_snapshot ?? (Object.keys(pricingSnapshot).length ? pricingSnapshot.commercial ?? pricingSnapshot : {})) as Record<string, unknown>;
    const customer = (quote.customer_snapshot ?? {}) as Record<string, string>;
    const event = (snapshot.event ?? {}) as Record<string, string>;
    const config = company.pdfConfiguration.commercialBank && typeof company.pdfConfiguration.commercialBank === "object" ? company.pdfConfiguration.commercialBank as Record<string, string> : {};
    const items = [...(quote.quotation_items ?? [])].sort((a, b) => Number(a.display_order) - Number(b.display_order));
    const configuredConditions = Array.isArray(company.pdfConfiguration.commercialReservationConditions) ? company.pdfConfiguration.commercialReservationConditions.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
    const breakdown = resolveCommercialBreakdown({ snapshot, items });
    stage = "QUOTE_SEND_PDF";
    const storedPath = currentVersion.pdf_storage_path;
    let pdf: Uint8Array;
    if (storedPath) {
      stage = "QUOTE_SEND_STORAGE";
      const stored = await admin.storage.from("orbit-documents").download(storedPath);
      if (stored.error) throw stored.error;
      pdf = new Uint8Array(await stored.data.arrayBuffer());
    } else {
      pdf = await createFormalQuotePdf({ number: quote.quotation_number, issueDate: quote.issue_date, expirationDate: quote.expiration_date, customer, event, lines: items.map((item) => ({ description: item.description || item.label, itemType: item.item_type, quantity: Number(item.quantity), quotedPrice: Number(item.quoted_price ?? item.unit_price), total: Number(item.total) })), ...breakdown, paymentCondition: snapshot.paymentCondition === "CORPORATE_CREDIT" || snapshot.paymentCondition === "CASH" ? snapshot.paymentCondition : "FIFTY_FIFTY", paymentTermDays: Number(snapshot.paymentTermDays ?? 0), company: { legalName: company.legalName, taxId: company.taxId, address: company.address, city: company.city, phone: company.phone, email: config.email || company.salesEmail || company.supportEmail, website: company.website, bankName: config.bankName || "Banco no configurado", bankAccountType: config.accountType || "Cuenta no configurada", bankAccountNumber: config.accountNumber || "Número no configurado", importantNotice: typeof company.pdfConfiguration.commercialImportantNotice === "string" ? company.pdfConfiguration.commercialImportantNotice : undefined, reservationConditions: configuredConditions, operationalConditions: normalizeQuoteOperationalConditions(company.pdfConfiguration.commercialOperationalConditions) } });
    }
    const pdfPath = storedPath ?? quoteStorageKey(quote.id, quote.quotation_number).replace(/\.pdf$/, `-${input.requestId}_V${version}.pdf`);
    if (!storedPath) {
      stage = "QUOTE_SEND_STORAGE";
      const upload = await admin.storage.from("orbit-documents").upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });
      if (upload.error) throw upload.error;
    }
    stage = "QUOTE_SEND_SIGNED_URL";
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
    stage = "QUOTE_SEND_CLAIM";
    const { data: claim, error: claimError } = await admin.from("commercial_sends").insert({ idempotency_key: input.requestId, recipient_email: recipients.to, cc_recipients: recipients.cc, category: "COMPANIES_QUOTE", quotation_id: quote.id, customer_id: quote.customer_id, project_id: quote.project_id, subject, body_snapshot: body, document_snapshot: { quote: quote.quotation_number, pdfPath, versionId: currentVersion.id, version, catalog: catalogSnapshot }, status: "PREPARING", sent_by: user.id, from_email: senderEmail, reply_to_email: typeof company.emailConfiguration.replyTo === "string" ? company.emailConfiguration.replyTo : senderEmail, mime_mode: "multipart/alternative", attempt_count: 0 }).select("id").single();
    if (claimError) {
      if (claimError.code === "23505") return { ok: true as const, message: "Este envío ya está siendo procesado." };
      throw claimError;
    }
    const signatureUrl = typeof company.emailConfiguration.signatureGifUrl === "string" ? company.emailConfiguration.signatureGifUrl : "";
    const signatureText = "Equipo BOOMBOX";
    const signature = signatureUrl ? `<p><img src="${escapeHtml(signatureUrl)}" alt="BOOMBOX" style="display:block;width:auto;max-width:280px;height:auto;max-height:72px;border:0"></p>` : `<p>${signatureText}</p>`;
    const cleanBody = withoutDuplicateSignature(withoutDuplicateSignature(body, company.emailSignature || signatureText), signatureText);
    const htmlParagraphs = emailParagraphs(cleanBody).map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
    const attachmentFilename = quoteDisplayFilename(quote.quotation_number);
    const htmlBody = renderPremiumQuotationEmail({
      preheader: `Tu cotización ${quote.quotation_number} está lista.`,
      eyebrow: "COTIZACIÓN BOOMBOX",
      title: "Tu propuesta está lista",
      contentHtml: htmlParagraphs,
      website: company.website,
      primaryAction: {
        href: pdfUrl.data.signedUrl,
        label: "VER COTIZACIÓN",
      },
      secondaryAction: catalogUrl
        ? { href: catalogUrl, label: "VER CATÁLOGO EMPRESAS" }
        : undefined,
      attachmentNote: `${attachmentFilename} está incluido como archivo adjunto.`,
      signatureHtml: signature,
    });
    stage = "QUOTE_SEND_GMAIL";
    acceptedMessage = await new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken()).send({ to: recipients.to, cc: recipients.cc, from: senderEmail, replyTo: typeof company.emailConfiguration.replyTo === "string" && company.emailConfiguration.replyTo.trim() ? company.emailConfiguration.replyTo : senderEmail, subject, idempotencyKey: input.requestId, textBody: `${cleanBody}\n\nCotización: ${pdfUrl.data.signedUrl}${catalogUrl ? `\nCatálogo: ${catalogUrl}` : ""}\n\n${signatureUrl ? "" : signatureText}`.trim(), htmlBody, driveFileIds: [], attachments: [{ filename: attachmentFilename, mimeType: "application/pdf", content: new Uint8Array(pdf) }] });
    const timestamp = new Date().toISOString();
    const { error: sendError } = await admin.from("commercial_sends").update({ ...buildGmailAcceptancePatch(acceptedMessage, senderEmail, timestamp), sent_at: timestamp }).eq("id", claim.id);
    if (sendError) throw sendError;
    stage = "QUOTE_SEND_QUOTE_UPDATE";
    if (["DRAFT", "NEGOTIATION"].includes(quote.status)) {
      const { data: updated, error: quoteError } = await client.from("quotations")
        .update({ status: "SENT", pdf_storage_path: pdfPath, updated_by: user.id, updated_at: timestamp })
        .eq("id", quote.id).eq("current_version_id", currentVersion.id).eq("status", quote.status)
        .eq("updated_at", quote.updated_at).select("id").maybeSingle();
      if (quoteError || !updated) throw quoteError ?? new Error("La versión fue modificada mientras se registraba el envío.");
    }
    stage = "QUOTE_SEND_VERSION_UPDATE";
    if (!storedPath) {
      const { error: versionUpdateError } = await client.from("quote_versions")
        .update({ status: quote.status === "VIEWED" ? "VIEWED" : "SENT", pdf_storage_path: pdfPath, sent_at: timestamp, sent_by: user.id })
        .eq("id", currentVersion.id).eq("quote_id", quote.id).is("pdf_storage_path", null)
        .in("status", ["DRAFT", "NEGOTIATION", "SENT", "VIEWED"]);
      if (versionUpdateError) throw versionUpdateError;
    }
    revalidatePath("/leads");
    return { ok: true as const, message: `${quote.quotation_number} enviada y registrada.` };
  } catch (error) {
    const technical = error as { code?: string; message?: string; details?: string };
    console.error("[ORBIT][QUOTE_SEND_FAILURE]", {
      quoteId: input.quoteId,
      requestId: input.requestId,
      stage,
      code: technical?.code ?? null,
      message: technical?.message ?? null,
      details: technical?.details ?? null,
    });
    if (acceptedMessage) {
      await admin.from("commercial_sends").update(buildGmailAcceptancePatch(acceptedMessage, acceptedProviderAccount, new Date().toISOString(), true)).eq("idempotency_key", input.requestId);
    }
    return fail(error, "No fue posible enviar la cotización.");
  }
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
    revalidatePath(`/quotes/${quoteId}`);
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
      address: String(formData.get("eventAddress") ?? ""),
      city: String(formData.get("eventCity") ?? ""),
      durationHours: Number(formData.get("durationHours")),
      customerCompany: String(formData.get("customerCompany") ?? ""),
      customerRut: String(formData.get("customerRut") ?? ""),
      customerContact: String(formData.get("customerContact") ?? ""),
      customerEmail: String(formData.get("customerEmail") ?? ""),
      customerPhone: String(formData.get("customerPhone") ?? ""),
      customerAddress: String(formData.get("customerAddress") ?? ""),
      paymentCondition: String(formData.get("paymentCondition") ?? ""),
      paymentTermDays: Number(formData.get("paymentTermDays")),
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
      return conversionSuccess(claim.projectId, true);
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
    const paymentTerms = resolveQuoteConversionPaymentTerms(review, overrides);
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
        address: event.address,
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
      serviceLines: items
        .filter((item) => item.itemType !== "TRANSPORT")
        .map((item) => ({
          serviceCode: item.code,
          quantity: item.quantity,
          durationHours: Number(event.durationHours),
        })),
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
      commercialAdjustment: { type: "COMMERCIAL_NEGOTIATION", mode: difference === 0 ? "OFFICIAL" : "NEGOTIATED", value: review.financial.net, reason: "Conversión de cotización comercial aceptada", internalNotes: `Fuente canónica: ${quoteId}`, subtotal: official, officialTotal: official, officialServicePrice, officialExtras, officialTransport, officialVenueSurcharge: 0, negotiatedServicePrice: acceptedService, negotiatedExtras: acceptedExtras, negotiatedTransport: acceptedTransport, negotiatedTotal: review.financial.net, difference, differencePercentage: official ? difference / official * 100 : 0, discountAmount: review.financial.discount, discountReason: "CORPORATE_AGREEMENT", commercialCharge: 0, appliedTransport: acceptedTransport, courtesyValue: 0, courtesies: [], paymentCondition: paymentTerms.paymentCondition, paymentTermDays: paymentTerms.paymentTermDays, paymentReceiptRequired: true, corporateCreditApproved: paymentTerms.paymentCondition === "CORPORATE_CREDIT", corporateVatApplied: review.financial.tax > 0, netAmount: review.financial.net, vatAmount: review.financial.tax, finalPrice: review.financial.total },
    };
    const result = await createCustomerProjectAction(draft);
    if (!result.ok) throw new Error(result.error);
    const projectId = result.project.id;
    const warnings: QuoteConversionWarning[] = [];
    try {
      const { error: finalizeError } = await client.rpc(
        "finalize_commercial_quote_conversion",
        {
          p_quote_id: quoteId,
          p_transaction_id: claim.transactionId,
          p_project_id: projectId,
          p_review: { event, reviewedAt: new Date().toISOString() },
        },
      );
      if (finalizeError) throw finalizeError;
    } catch (finalizeError) {
      conversionWarning(warnings, "Vinculación comercial", finalizeError);
    }
    try {
      const { data: persistedProject, error: projectError } = await client
        .from("projects")
        .select("finance,operations")
        .eq("id", projectId)
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
        .eq("id", projectId);
      if (snapshotWriteError) throw snapshotWriteError;
    } catch (snapshotError) {
      conversionWarning(warnings, "Ficha comercial del Evento", snapshotError);
    }
    const ocFile = formData.get("purchaseOrderFile");
    if (ocFile instanceof File && ocFile.size) {
      try {
        const purchaseOrder = new FormData();
        purchaseOrder.set("projectId", projectId);
        purchaseOrder.set(
          "purchaseOrderNumber",
          String(formData.get("purchaseOrderNumber") ?? ""),
        );
        purchaseOrder.set("file", ocFile);
        const oc = await attachCustomerPurchaseOrderAction(purchaseOrder);
        if (!oc.ok) throw new Error(oc.error);
        if (oc.warning) throw new Error(oc.warning);
      } catch (ocError) {
        conversionWarning(warnings, "OC Cliente", ocError);
      }
    }
    try {
      const drive = await archiveAcceptedQuoteForProject({
        quoteId,
        projectId,
      });
      if (!drive.archived)
        throw new Error("El archivo administrativo de la cotización está pendiente.");
    } catch (driveError) {
      conversionWarning(warnings, "Google Drive", driveError);
    }
    revalidatePath("/leads"); revalidatePath(`/quotes/${quoteId}`); revalidatePath(`/projects/${projectId}`);
    return conversionSuccess(projectId, Boolean(result.project.reservationResumed), warnings);
  } catch (error) {
    const quoteId = String(formData.get("quoteId") ?? "");
    if (quoteId) {
      try {
        const { client, role } = await founder();
        if (["CEO", "ADMINISTRATOR"].includes(role)) {
          const recovered = await recoverCommittedQuoteConversion(quoteId, client);
          if (recovered) return recovered;
        }
      } catch (recoveryError) {
        console.error("[ORBIT][QUOTE_CONVERSION_RECOVERY]", recoveryError);
      }
    }
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


/** Founder-only composer for a previously issued canonical quotation. Never creates a quote. */
export async function prepareEventQuoteResendAction(projectId: string, quoteId: string) {
  try {
    const { role } = await founder();
    if (!["CEO", "ADMINISTRATOR"].includes(role)) throw new Error("Acceso administrativo requerido.");
    const admin = createAdminClient();
    const { data: quote, error } = await admin.from("quotations")
      .select("id,project_id,quotation_number,customer_snapshot,commercial_snapshot")
      .eq("id", quoteId).eq("project_id", projectId).single();
    if (error || !quote) throw new Error("No se encontró la cotización original de este evento.");
    const snapshot = (quote.customer_snapshot ?? {}) as Record<string, string>;
    const commercial = (quote.commercial_snapshot ?? {}) as Record<string, unknown>;
    const nestedCustomer = (commercial.customer ?? {}) as Record<string, string>;
    const email = (snapshot.email || nestedCustomer.email || "").trim();
    if (!email) throw new Error("La cotización no tiene destinatario original. Revisa sus datos antes de enviarla.");
    const contact = snapshot.contact || nestedCustomer.contact || "cliente";
    const number = quote.quotation_number;
    return { ok: true as const, number, email,
      subject: `BOOMBOX | Reenvío cotización ${number}`,
      body: `Hola ${contact},\\n\\nSegún lo solicitado, te reenviamos la cotización formal ${number} de BOOMBOX. Puedes revisar la propuesta y sus condiciones en el documento adjunto.\\n\\nQuedamos atentos a tus comentarios.` };
  } catch (error) { return fail(error, "No fue posible recuperar la cotización original."); }
}

/** Guard against sending a quote from another event; preserve accepted/converted snapshots. */
export async function resendEventFormalQuoteAction(input: {
  projectId: string; quoteId: string; email: string; subject: string; body: string; requestId: string;
}) {
  try {
    const { role } = await founder();
    if (!["CEO", "ADMINISTRATOR"].includes(role)) throw new Error("Acceso administrativo requerido.");
    const admin = createAdminClient();
    const { data, error } = await admin.from("quotations").select("id")
      .eq("id", input.quoteId).eq("project_id", input.projectId).single();
    if (error || !data) throw new Error("La cotización no pertenece a este evento.");
    return await sendFormalQuoteAction({ quoteId: input.quoteId, email: input.email,
      subject: input.subject, body: input.body, requestId: input.requestId });
  } catch (error) { return fail(error, "No fue posible reenviar la cotización."); }
}
