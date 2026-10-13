import { createAdminClient } from "@/lib/supabase/admin";

type WebQuoteRow = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  event_type: string;
  event_date: string;
  category: string;
  mode: string;
  status: string;
  source_domain: string;
  sent_at: string | null;
};

export async function WebQuoteIntakePanel() {
  const db = createAdminClient();
  const { data, error } = await db.from("web_quote_intakes")
    .select("id,created_at,full_name,email,event_type,event_date,category,mode,status,source_domain,sent_at")
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = (data ?? []) as WebQuoteRow[];
  return (
    <section className="mx-auto w-full max-w-[1480px] px-4 pb-8 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-5 text-white">
        <h2 className="text-lg font-semibold">AutoCotizador · solicitudes web</h2>
        <p className="mt-1 text-sm text-zinc-300">Envíos automáticos desactivados hasta validar el formulario, Gmail y la prueba controlada.</p>
        {error ? <p className="mt-3 text-sm text-amber-300">Aún no está disponible el registro de solicitudes. Verifica que se haya aplicado la migración de Supabase.</p>
          : <><p className="mt-3 text-sm text-zinc-200">Últimas {rows.length} solicitudes · {rows.filter(row => row.status === "SENT").length} enviadas confirmadas · {rows.filter(row => row.mode === "MANUAL_REVIEW").length} para revisión manual</p>
            {rows.length === 0 ? <p className="mt-3 text-sm text-zinc-400">Todavía no hay solicitudes ingresadas por la nueva conexión web.</p> :
              <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-zinc-400"><tr><th className="p-2">Cliente</th><th className="p-2">Tipo</th><th className="p-2">Fecha</th><th className="p-2">Origen</th><th className="p-2">Estado</th></tr></thead><tbody>{rows.map(row => <tr className="border-t border-zinc-800" key={row.id}><td className="p-2"><div>{row.full_name}</div><div className="text-xs text-zinc-400">{row.email}</div></td><td className="p-2">{row.event_type}</td><td className="p-2">{row.event_date}</td><td className="p-2">{row.source_domain}</td><td className="p-2">{row.status === "SENT" ? "Cotización respondida automáticamente" : row.mode === "MANUAL_REVIEW" ? "Revisión manual pendiente" : row.status === "FAILED" ? "Envío fallido" : "Recibida · pendiente de envío"}</td></tr>)}</tbody></table></div>}
            </>}
      </div>
    </section>
  );
}
