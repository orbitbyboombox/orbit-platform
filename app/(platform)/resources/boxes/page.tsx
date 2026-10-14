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
  const [boxes, eventsResult, suppliesResult] = await Promise.all([
    loadBoxes(client),
    client.from("projects").select("id,name,event_date,event_time,event_time_mode,project_services(service_code)").is("deleted_at", null).gte("event_date", today()).lte("event_date", addDays(today(), 90)).order("event_date").order("event_time").limit(100),
    client.from("supplies").select("id,name,catalog_code,current_stock,unit,stock_status").is("deleted_at", null).order("name"),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  if (suppliesResult.error) throw suppliesResult.error;
  return <main className="space-y-4"><section aria-labelledby="boxes-paper-stock-title" className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Bodega · lectura</p><h2 id="boxes-paper-stock-title" className="mt-1 text-lg font-semibold">Stock disponible para Cajas</h2><p className="mt-1 text-sm text-muted">Consulta de solo lectura; no modifica inventario ni movimientos.</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border px-3 py-1.5 text-sm font-semibold">{(suppliesResult.data ?? []).reduce((total, supply) => total + Number(supply.current_stock ?? 0), 0).toLocaleString("es-CL")} unidades</span><Link href="/resources#warehouse-inventory" className="inline-flex min-h-10 items-center rounded-xl border px-3 text-sm font-semibold text-brand hover:border-brand" data-issue68-warehouse-link>Ver inventario Bodega</Link></div></section><BlackBoxMaster initialBoxes={boxes} events={(eventsResult.data ?? []).map((event) => ({ id: event.id, name: event.name, date: event.event_date, time: event.event_time, service: Array.isArray(event.project_services) ? event.project_services.map((item) => item.service_code).filter(Boolean).join(" + ") : "" }))} /></main>;
}
