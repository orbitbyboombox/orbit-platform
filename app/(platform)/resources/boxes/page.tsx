import { redirect } from "next/navigation";
import Link from "next/link";
import { BlackBoxMaster } from "@/features/resources/black-box-master";
import { loadBoxes } from "@/features/resources/box-inventory";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

export default async function BoxesPage() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const [boxes, eventsResult] = await Promise.all([
    loadBoxes(client),
    client.from("projects").select("id,name,event_date,event_time,event_time_mode,project_services(service_code)").is("deleted_at", null).gte("event_date", today()).lte("event_date", addDays(today(), 90)).order("event_date").order("event_time").limit(100),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  return <main className="space-y-4"><section aria-labelledby="boxes-paper-stock-title" className="rounded-2xl border bg-card p-4 sm:p-5"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Cajas → Bodega · lectura</p><h2 id="boxes-paper-stock-title" className="mt-1 text-lg font-semibold">Stock real de papel y saldos por Caja</h2><p className="mt-1 max-w-3xl text-sm text-muted">La pantalla principal consulta lotes físicos y movimientos registrados por Caja. El costo financiero del papel se mantiene separado en Finanzas.</p><div className="mt-3 flex flex-wrap gap-2"><Link href="/resources#warehouse-inventory" className="inline-flex min-h-10 items-center rounded-xl border px-3 text-sm font-semibold text-brand hover:border-brand" data-issue70-warehouse-link>Ver inventario Bodega y movimientos</Link><span className="inline-flex min-h-10 items-center rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-semibold text-amber-200">Carga Bodega → Caja: bloqueada hasta RPC transaccional</span></div></div></section><BlackBoxMaster initialBoxes={boxes} events={(eventsResult.data ?? []).map((event) => ({ id: event.id, name: event.name, date: event.event_date, time: event.event_time, service: Array.isArray(event.project_services) ? event.project_services.map((item) => item.service_code).filter(Boolean).join(" + ") : "" }))} /></main>;
}
