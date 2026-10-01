import { createAdminClient } from "@/lib/supabase/admin";
import { loadActiveMunicipalities } from "@/features/settings/master-data/municipality-master-data";
import { TransportValueLookup } from "./transport-value-lookup";

export const dynamic = "force-dynamic";

export default async function TransportLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ municipality?: string; type?: string }>;
}) {
  const params = await searchParams;
  const municipalities = await loadActiveMunicipalities(createAdminClient());
  const customerType = params.type === "company" ? "company" : "private";

  return (
    <main className="min-h-screen bg-[#08090b] px-4 py-8 text-white sm:py-12">
      <section className="mx-auto max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[#0e1013] shadow-2xl">
        <div className="border-t-[6px] border-[#F78900] bg-[#111214] px-6 py-8 text-center sm:px-8">
          <p className="text-3xl font-black tracking-tight">
            BOOM<span className="text-[#F78900]">BOX</span>
          </p>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F78900]">
            TRASLADO DEL SERVICIO
          </p>
          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
            Conoce el valor de traslado
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/65">
            Selecciona la comuna del evento. El valor se obtiene directamente de la tarifa vigente de BOOMBOX.
          </p>
        </div>

        <div className="p-5 sm:p-8">
          <TransportValueLookup
            customerType={customerType}
            initialMunicipality={params.municipality ?? ""}
            municipalities={municipalities}
          />
        </div>

        <footer className="border-t border-white/10 px-6 py-5 text-[10px] leading-5 text-white/40 sm:px-8">
          Valores sujetos a la comuna seleccionada y a la tarifa BOOMBOX vigente al momento de la reserva.
        </footer>
      </section>
    </main>
  );
}
