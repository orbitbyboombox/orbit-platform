import { loadCompanySettingsCached } from "@/features/company-settings/repository";
import { resolveCollectionBankDetails } from "@/features/accounts-receivable/collection-bank-details";
import { BankDetailsCopyCard } from "./bank-details-copy-card";

export const dynamic = "force-static";
export const revalidate = 300;

export default async function BankDetailsPage() {
  const settings = await loadCompanySettingsCached();
  const bank = resolveCollectionBankDetails(settings);
  return (
    <main className="min-h-screen bg-[#08090b] px-4 py-8 text-white sm:py-12">
      <section className="mx-auto max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[#0e1013] shadow-2xl">
        <div className="border-t-[6px] border-[#F78900] bg-[#111214] px-6 py-8 text-center sm:px-8">
          <img
            alt="BOOMBOX"
            className="mx-auto h-auto w-[220px] max-w-full"
            src="https://app.bbox.cl/branding/boombox-official-logo.png"
          />
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F78900]">
            DATOS PARA TRANSFERENCIA
          </p>
          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
            Copia y pega en tu banco
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/70">
            Estos son los datos oficiales configurados en ORBIT para pagos BOOMBOX.
          </p>
        </div>
        <div className="p-5 sm:p-8">
          <BankDetailsCopyCard bank={bank} />
        </div>
        <footer className="border-t border-white/10 px-6 py-5 text-[10px] uppercase tracking-[0.14em] text-white/40 sm:px-8">
          BOOMBOX · Comunicación emitida mediante ORBIT
        </footer>
      </section>
    </main>
  );
}
