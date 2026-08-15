import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { catalogCategoryFromSlug } from "@/features/commercial-hub/catalogs";
import { loadActiveCommercialDocument } from "@/features/commercial-hub/catalog-repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = catalogCategoryFromSlug(slug);
  if (!category) return NextResponse.json({ error: "Catálogo no encontrado." }, { status: 404 });
  const document = await loadActiveCommercialDocument(category);
  if (!document) return NextResponse.json({ error: "Catálogo no disponible." }, { status: 404 });
  const download = request.nextUrl.searchParams.get("download") === "1";
  const admin = createAdminClient();
  const signed = await admin.storage.from(document.storage_bucket).createSignedUrl(
    document.storage_path,
    60 * 60,
    download ? { download: document.filename } : undefined,
  );
  if (signed.error) return NextResponse.json({ error: "No fue posible abrir el catálogo." }, { status: 503 });
  return NextResponse.redirect(signed.data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}
