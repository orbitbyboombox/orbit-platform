import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadCompanySettings } from "@/features/company-settings";
import { createFormalQuotePdf } from "@/features/commercial-hub/formal-quote-pdf";
import { quoteDisplayFilename } from "@/features/commercial-hub/presentation";
import { normalizeQuoteOperationalConditions } from "@/features/commercial-hub/operational-conditions";

export async function GET(
  request: Request,
  context: { params: Promise<{ quoteId: string }> },
) {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user)
      return NextResponse.json(
        { message: "Sesión requerida." },
        { status: 401 },
      );
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .single();
    if (!profile || !["CEO", "ADMINISTRATOR", "SALES", "OPERATIONS", "READONLY"].includes(profile.role))
      return NextResponse.json(
        { message: "Acceso denegado." },
        { status: 403 },
      );
    const { quoteId } = await context.params;
    const [{ data: quote, error }, company] = await Promise.all([
      client
        .from("quotations")
        .select(
          "status,quotation_number,issue_date,expiration_date,customer_snapshot,commercial_snapshot,accepted_snapshot,quotation_items(description,label,quantity,quoted_price,unit_price,total,display_order)",
        )
        .eq("id", quoteId)
        .single(),
      loadCompanySettings(client),
    ]);
    if (error || !quote)
      return NextResponse.json(
        { message: "Cotización no encontrada." },
        { status: 404 },
      );
    const accepted = quote.accepted_snapshot && typeof quote.accepted_snapshot === "object"
      ? quote.accepted_snapshot as Record<string, unknown>
      : {};
    const acceptedQuotation = accepted.quotation && typeof accepted.quotation === "object"
      ? accepted.quotation as Record<string, unknown>
      : {};
    const snapshot = ((accepted.commercial && typeof accepted.commercial === "object")
      ? accepted.commercial
      : quote.commercial_snapshot ?? {}) as Record<
      string,
      unknown
    >;
    const pdfConfiguration = company.pdfConfiguration;
    const bank =
      pdfConfiguration.commercialBank &&
      typeof pdfConfiguration.commercialBank === "object"
        ? (pdfConfiguration.commercialBank as Record<string, string>)
        : {};
    const customer = ((accepted.customer && typeof accepted.customer === "object")
      ? accepted.customer
      : quote.customer_snapshot ?? {}) as Record<string, string>;
    const event = (snapshot.event ?? {}) as Record<string, string>;
    const configuredConditions = Array.isArray(
      pdfConfiguration.commercialReservationConditions,
    )
      ? pdfConfiguration.commercialReservationConditions.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        )
      : [];
    const acceptedItems = Array.isArray(accepted.items)
      ? accepted.items.map((item) => {
          const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
          return { description: String(value.label ?? value.code ?? "Ítem"), label: String(value.label ?? ""), quantity: Number(value.quantity ?? 1), quoted_price: Number(value.quotedPrice ?? 0), unit_price: Number(value.quotedPrice ?? 0), total: Number(value.total ?? 0), display_order: Number(value.displayOrder ?? 0) };
        })
      : [];
    const items = [...(acceptedItems.length ? acceptedItems : quote.quotation_items ?? [])].sort(
      (a, b) => Number(a.display_order) - Number(b.display_order),
    );
    const pdf = await createFormalQuotePdf({
      number: String(acceptedQuotation.number ?? quote.quotation_number),
      issueDate: String(acceptedQuotation.issueDate ?? quote.issue_date),
      expirationDate: String(acceptedQuotation.expirationDate ?? quote.expiration_date),
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
      paymentCondition: snapshot.paymentCondition === "CORPORATE_CREDIT" || snapshot.paymentCondition === "CASH" ? snapshot.paymentCondition : "FIFTY_FIFTY",
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
    const disposition =
      new URL(request.url).searchParams.get("download") === "1"
        ? "attachment"
        : "inline";
    const filename = quoteDisplayFilename(quote.quotation_number);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="cotizacion-boombox.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[commercial-quote-pdf]", error);
    return NextResponse.json(
      { message: "No fue posible generar el PDF." },
      { status: 500 },
    );
  }
}
