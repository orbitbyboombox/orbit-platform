import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { catalogCategoryFromSlug } from "@/features/commercial-hub/catalogs";
import { CatalogActions } from "./catalog-actions";

export const dynamic = "force-dynamic";

export default async function PublicCatalogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = catalogCategoryFromSlug(slug);
  if (!category) notFound();
  const admin = createAdminClient();
  const { data: document, error } = await admin.from("commercial_documents").select("name,version").eq("category", category).eq("status", "ACTIVE").maybeSingle();
  if (error) throw error;
  if (!document) notFound();
  return <main className="min-h-screen bg-[#07090d] px-4 py-6 text-white sm:px-8">
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#101319] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xl font-bold tracking-[.22em]">BOOMBOX®</p><h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{document.name}</h1><p className="mt-1 text-sm text-white/60">Versión {document.version}</p></div>
        <CatalogActions name={document.name} />
      </header>
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white">
        <iframe className="h-[72vh] min-h-[520px] w-full" src={`/catalogo/${slug}/document`} title={`${document.name} · BOOMBOX`} />
      </section>
    </div>
  </main>;
}
