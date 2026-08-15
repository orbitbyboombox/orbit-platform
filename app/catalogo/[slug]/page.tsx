import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { catalogCategoryFromSlug } from "@/features/commercial-hub/catalogs";
import { loadActiveCommercialDocument } from "@/features/commercial-hub/catalog-repository";
import { loadCompanySettings } from "@/features/company-settings";
import { CatalogActions } from "./catalog-actions";
import { ContinuousPdfReader } from "./continuous-pdf-reader";

export const dynamic = "force-dynamic";

export default async function PublicCatalogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = catalogCategoryFromSlug(slug);
  if (!category) notFound();
  const admin = createAdminClient();
  const [document, company] = await Promise.all([
    loadActiveCommercialDocument(category),
    loadCompanySettings(admin),
  ]);
  if (!document) notFound();
  const contactEmail = company.salesEmail || company.supportEmail || "contacto@boom-box.cl";
  return <main className="min-h-screen overflow-x-hidden bg-[#07090d] px-3 py-3 text-white sm:px-8 sm:py-6">
    <div className="mx-auto max-w-6xl">
      <header className="mb-3 flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#101319] p-4 sm:mb-5 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div><p className="text-base font-bold tracking-[.22em] sm:text-xl">BOOMBOX®</p><h1 className="mt-1.5 text-xl font-semibold sm:mt-3 sm:text-3xl">{document.name}</h1><p className="mt-0.5 text-xs text-white/60 sm:mt-1 sm:text-sm">Versión {document.version}</p></div>
        <CatalogActions name={document.name} slug={slug} />
      </header>
      <ContinuousPdfReader name={document.name} url={`/catalogo/${slug}/document`} />
      <section className="my-5 rounded-2xl border border-white/10 bg-[#101319] p-5 text-center sm:my-8 sm:p-8">
        <h2 className="text-xl font-semibold sm:text-2xl">¿QUIERES COTIZAR O RESERVAR?</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-white/65 sm:text-base">Cuéntanos la fecha y lugar de tu evento y te ayudamos a revisar disponibilidad.</p>
        <a className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl px-5 font-semibold" href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Cotización ${document.name}`)}`} style={{ backgroundColor: "#f78900", color: "#050505" }}>CONTACTAR A BOOMBOX</a>
      </section>
    </div>
  </main>;
}
