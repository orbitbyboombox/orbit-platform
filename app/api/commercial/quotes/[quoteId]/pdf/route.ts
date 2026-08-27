import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadFormalQuoteDocument } from "@/features/commercial-hub/formal-quote-document";

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
    const document = await loadFormalQuoteDocument(client, quoteId);
    const disposition =
      new URL(request.url).searchParams.get("download") === "1"
        ? "attachment"
        : "inline";
    return new NextResponse(new Blob([Uint8Array.from(document.bytes)]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="cotizacion-boombox.pdf"; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[commercial-quote-pdf]", error);
    if (error instanceof Error && error.message === "Cotización no encontrada.")
      return NextResponse.json(
        { message: "Cotización no encontrada." },
        { status: 404 },
      );
    return NextResponse.json(
      { message: "No fue posible generar el PDF." },
      { status: 500 },
    );
  }
}
