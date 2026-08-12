import "server-only";
import {CalendarDays,Package} from "lucide-react";
import {createAdminClient} from "@/lib/supabase/admin";
import {portalLogoutAction} from "./actions";

export async function StaffPortal({staffId}:{staffId:string}){
  const admin=createAdminClient();
  const[{data:staff,error:staffError},{data:assignments,error:assignmentError}]=await Promise.all([
    admin.from("staff").select("first_name,last_name").eq("id",staffId).single(),
    admin.from("assignments").select("id,status,assignment_type,resources,projects!inner(name,event_date,event_time,location,city)").eq("staff_id",staffId).is("deleted_at",null).order("created_at",{ascending:false}),
  ]);
  const error=staffError??assignmentError;if(error)throw error;
  return <main className="min-h-screen bg-background p-4 text-foreground sm:p-8"><div className="mx-auto max-w-6xl space-y-6"><header className="flex flex-col gap-4 rounded-3xl border bg-card p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Portal Staff</p><h1 className="mt-2 text-3xl font-semibold">Hola, {staff?.first_name}.</h1><p className="mt-2 text-muted">Tus eventos operacionales asignados.</p></div><form action={portalLogoutAction.bind(null,"STAFF")}><button className="min-h-11 rounded-xl border px-4 text-sm font-medium">Cerrar sesión</button></form></header><section className="rounded-3xl border bg-card p-5 sm:p-7"><div className="flex items-center gap-2"><CalendarDays className="size-5 text-brand"/><h2 className="text-xl font-semibold">Eventos asignados</h2></div><div className="mt-5 space-y-3">{assignments?.length?assignments.map(item=>{const project=Array.isArray(item.projects)?item.projects[0]:item.projects;return <article className="rounded-2xl border p-4" key={item.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{project?.name}</p><p className="mt-1 text-sm text-muted">{project?.event_date} · {project?.event_time?.slice(0,5)} · {project?.city}</p></div><span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">{item.status}</span></div><p className="mt-4 text-sm"><Package className="mr-2 inline size-4"/>Responsabilidad: {item.assignment_type}</p></article>}):<p className="text-sm text-muted">Aún no tienes eventos asignados.</p>}</div></section></div></main>;
}
