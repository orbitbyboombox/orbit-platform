import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateWebQuoteAction } from "./review-actions";

const labels: Record<string, string> = { PENDING: "Pendiente", SENDING: "Requiere conciliación", ACCEPTED: "Aceptado por Gmail · recepción no confirmada", FAILED: "Falló la notificación", UNKNOWN: "Entrega incierta · revisar antes de reenviar" };
export async function WebQuoteInbox() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.from("web_quote_leads").select("solicitud_id,payload,status,created_at,notification_status,notification_recipient,notification_provider_id,review_notes").eq("is_test", false).order("created_at", { ascending: false }).limit(100);
  return <section className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
    <h2 className="text-xl font-semibold">Cotizaciones recibidas desde la web</h2>
    <p className="mb-4 text-sm text-slate-500">Solicitudes recibidas; aún no son reservas ni eventos. Matrimonios y Empresas conservan su origen.</p>
    {error ? <p role="status">Bandeja web pendiente de configuración. No se pudo consultar el registro.</p> : !data?.length ? <p>No hay solicitudes web registradas.</p> : data.map(row => {
      const p = row.payload as Record<string, string>;
      return <details key={row.solicitud_id} className="mb-3 rounded-xl border p-4">
        <summary className="cursor-pointer break-words font-medium">{p.nombre} · {p.tipo} · {p.paginaOrigen} · {row.status === "ARCHIVED" ? "Archivada" : row.status === "REVIEWED" ? "Revisada" : "Nueva"}</summary>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <p>{p.correo} · {p.telefono}</p><p>{p.fecha || "Fecha por definir"} · {p.horario || "Horario por definir"}</p>
          <p>Servicio: {p.servicio || "Por definir"}</p><p>{p.lugarEvento}</p>
          <p className="whitespace-pre-wrap break-words sm:col-span-2">{p.mensaje}</p>
          <p className="sm:col-span-2">Correo: {labels[row.notification_status] ?? row.notification_status}</p>
          <p className="break-all sm:col-span-2">Destino: {row.notification_recipient} · Referencia de correo: {row.notification_provider_id || "Sin referencia del proveedor"}</p>
          <p className="break-all sm:col-span-2">ID: {row.solicitud_id} · {new Date(row.created_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</p>
        </div>
        <form action={updateWebQuoteAction} className="mt-4 grid gap-3">
          <input type="hidden" name="solicitudId" value={row.solicitud_id} />
          <label>Estado <select name="status" defaultValue={row.status} className="rounded border p-2"><option value="NEW">Nueva</option><option value="REVIEWED">Revisada</option><option value="ARCHIVED">Archivada</option></select></label>
          <label>Notas y correcciones internas <textarea name="notes" maxLength={2000} defaultValue={row.review_notes ?? ""} className="block w-full rounded border p-2" /></label>
          <button type="submit" className="w-fit rounded bg-slate-900 px-4 py-2 text-white">Guardar revisión</button>
        </form>
      </details>;
    })}
  </section>;
}
