import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadActiveMunicipalities } from "@/features/settings/master-data/municipality-master-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Valor de traslado | BOOMBOX", robots: { index: false, follow: false } };
const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);

export default async function TransportLookupPage({ searchParams }: { searchParams: Promise<{ comuna?: string; type?: string }> }) {
  const params = await searchParams;
  const corporate = params.type === "company";
  const name = typeof params.comuna === "string" ? params.comuna.slice(0, 120) : "";
  let entries: Awaited<ReturnType<typeof loadActiveMunicipalities>> = [];
  let loadError = false;
  try { entries = await loadActiveMunicipalities(createAdminClient()); }
  catch (error) { console.error("[ORBIT][PUBLIC_TRANSPORT_LOOKUP]", error); loadError = true; }
  const selected = entries.find((item) => item.name.toLocaleLowerCase("es-CL") === name.toLocaleLowerCase("es-CL"));
  const santiagoProvince = entries.find((item) => item.transportCode === "SANTIAGO_PROVINCE");
  return (
    <main className="min-h-screen bg-[#0b0c0e] px-4 py-10 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/15 bg-[#121316] p-6 shadow-xl sm:p-10">
        <div className="mb-8 border-b border-white/15 pb-5">
          <p className="text-xl font-black tracking-[0.1em]">BOOMBOX<span className="text-[#f78900]">®</span></p>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-[#f78900]">Valor de traslado</p>
        </div>
        <h1 className="text-2xl font-bold sm:text-3xl">Conoce el traslado para tu evento</h1>
        <p className="mt-4 text-sm leading-7 text-white/70">Selecciona la comuna donde se realizará tu evento. El valor se consulta directamente de la tabla comercial vigente de BOOMBOX.</p>
        <form className="mt-7 space-y-4" method="GET">
          <input name="type" type="hidden" value={corporate ? "company" : "private"} />
          <label className="block text-sm font-semibold" htmlFor="comuna">Comuna del evento</label>
          <select className="h-12 w-full rounded-xl border border-white/25 bg-[#202124] px-3 text-white" defaultValue={selected?.name ?? ""} id="comuna" name="comuna" required>
            <option value="">Selecciona una comuna</option>
            {entries.map((item) => <option key={item.transportCode + item.name} value={item.name}>{item.name}</option>)}
          </select>
          <button className="min-h-12 w-full rounded-xl bg-[#f78900] px-5 font-bold text-black" type="submit">CONSULTAR VALOR DE TRASLADO</button>
        </form>
        {selected ? (
          <section aria-live="polite" className="mt-6 rounded-2xl border border-[#f78900]/40 bg-[#f78900]/10 p-5">
            <p className="text-sm text-white/70">{selected.name} · {selected.province}</p>
            {selected.pricingStatus === "DEFINED" ? <p className="mt-2 text-3xl font-bold text-[#f78900]">{money(selected.transport)}{corporate ? <span className="ml-2 text-sm font-medium text-white/80">+ IVA</span> : null}</p> : <p className="mt-2 font-semibold text-[#f78900]">Valor sujeto a cotización</p>}
          </section>
        ) : null}
        {loadError ? <p role="alert" className="mt-5 rounded-xl border border-red-400/40 p-4 text-sm text-red-200">Por ahora no podemos cargar los traslados. Escríbenos y te ayudaremos.</p> : null}
        <p className="mt-7 text-xs leading-6 text-white/60">{santiagoProvince ? `Provincia de Santiago: ${money(santiagoProvince.transport)} según tarifa vigente. ` : ""}Otras provincias de la Región Metropolitana tienen valores propios según la comuna. El valor final se confirma en la cotización del evento.</p>
        <a className="mt-6 inline-block text-sm font-semibold text-[#f78900] underline" href="https://www.boom-box.cl/">Volver a BOOMBOX</a>
      </div>
    </main>
  );
}
