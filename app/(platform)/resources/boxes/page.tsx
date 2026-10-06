import { redirect } from "next/navigation";
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
    client.from("projects").select("id,name,event_date,event_time,event_time_mode").is("deleted_at", null).gte("event_date", today()).lte("event_date", addDays(today(), 90)).order("event_date").order("event_time").limit(100),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  return <main>{/* Cajas Negras · Master Admin */}<BlackBoxMaster initialBoxes={boxes} events={(eventsResult.data ?? []).map((event) => ({ id: event.id, name: event.name, date: event.event_date, time: event.event_time }))} /></main>;
}
