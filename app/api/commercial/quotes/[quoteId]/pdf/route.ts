import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadCompanySettings } from "@/features/company-settings";
import { createFormalQuotePdf } from "@/features/commercial-hub/formal-quote-pdf";
import { quoteDisplayFilename } from "@/features/commercial-hub/presentation";

export async function GET(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return NextResponse.json({ message: "Sesión requerida." }, { status: 401 });
    const { quoteId } = await context.params;
    const [{ data: quote, error }, company] = await Promise.all([
      client.from("quotations").select("quotation_number,issue_date,expiration_date,customer_snapshot,commercial_snapshot,quotation_items(description,label,quantity,quoted_price,unit_price,total,display_order)").eq("id", quoteId).single(),
      loadCompanySettings(client),
    ]);
    if (error || !quote) return NextResponse.json({ message: "Cotización no encontrada." }, { status: 404 });
    const snapshot = (quote.commercial_snapshot ?? {}) as Record<string, unknown>;
    const pdfConfiguration = company.pdfConfiguration;
    const bank =
      pdfConfiguration.commercialBank &&
      typeof pdfConfiguration.commercialBank === "object"
        ? (pdfConfiguration.commercialBank as Record<string, string>)
        : {};
    const customer = (quote.customer_snapshot ?? {}) as Record<string, string>;
    const event = (snapshot.event ?? {}) as Record<string, string>;
    const items = [...(quote.quotation_items ?? [])].sort((a, b) => Number(a.display_order) - Number(b.display_order));
    const pdf = await createFormalQuotePdf({
      number: quote.quotation_number,
      issueDate: quote.issue_date,
      expirationDate: quote.expiration_date,
      customer,
      event,
      lines: items.map((item) => ({ description: item.description || item.label, quantity: Number(item.quantity), quotedPrice: Number(item.quoted_price ?? item.unit_price), total: Number(item.total) })),
      subtotal: Number(snapshot.subtotal ?? 0), discount: Number(snapshot.discount ?? 0), net: Number(snapshot.net ?? 0), tax: Number(snapshot.tax ?? 0), total: Number(snapshot.total ?? 0), deposit: Number(snapshot.deposit ?? 0), balance: Number(snapshot.balance ?? 0),
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
      },
    });
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    const filename = quoteDisplayFilename(quote.quotation_number);
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${disposition}; filename="cotizacion-boombox.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[commercial-quote-pdf]", error);
    return NextResponse.json({ message: "No fue posible generar el PDF." }, { status: 500 });
  }
}
