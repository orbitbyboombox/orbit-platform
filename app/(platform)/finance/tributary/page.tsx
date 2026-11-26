import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTributaryAccess } from "@/features/tributary/access";

const kinds: Record<number,string> = {33:"Factura electrónica",39:"Boleta electrónica",52:"Guía de despacho electrónica",56:"Nota de débito",61:"Nota de crédito"};
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Filters = { project?: string; customer?: string; trip?: string };

async function createDraft(form: FormData) {
  "use server";
  const client = await requireTributaryAccess();
  const project = String(form.get("project") ?? "");
  const kind = Number(form.get("kind"));
  if (!uuid.test(project) || ![33,39].includes(kind)) notFound();
  const { error } = await client.rpc("orbit_tributary_draft",{p_project:project,p_kind:kind});
  if (error) {
    redirect(`/finance/tributary?project=${project}&result=unavailable`);
  }
  redirect(`/finance/tributary?project=${project}`);
}

async function changeIntention(form: FormData) {
  "use server";
  const client = await requireTributaryAccess();
  const id = Number(form.get("id"));
  const action = String(form.get("action"));
  const project = String(form.get("project") ?? "");
  if (!Number.isSafeInteger(id) || id<1 || !uuid.test(project)) notFound();
  const response = action === "approve"
    ? await client.rpc("orbit_tributary_approve",{p_id:id})
    : ["56","61"].includes(action)
      ? await client.rpc("orbit_tributary_note",{p_id:id,p_kind:Number(action)})
      : notFound();
  redirect(`/finance/tributary?project=${project}${response.error ? "&result=unavailable" : ""}`);
}

async function createDispatch(form: FormData) {
  "use server";
  const client=await requireTributaryAccess();
  const project=String(form.get("project")??""), trip=String(form.get("trip")??"");
  const assets=form.getAll("assets").map(String);
  if(!uuid.test(project)||!uuid.test(trip)||!assets.length||assets.length>40||!assets.every(id=>uuid.test(id))) notFound();
  const {error}=await client.rpc("orbit_tributary_dispatch_draft",{
    p_project:project,p_trip:trip,p_assets:assets,
    p_receiver_name:String(form.get("receiver")??""),p_receiver_rut:String(form.get("rut")??"").trim().toUpperCase(),
    p_city:String(form.get("city")??""),p_carrier_rut:String(form.get("carrier")??"").trim().toUpperCase(),
  });
  redirect(`/finance/tributary?project=${project}${error?"&result=dispatch-unavailable":""}`);
}

export default async function TributaryPage({searchParams}:{searchParams:Promise<Filters & {result?: string}>}) {
  const client = await requireTributaryAccess();
  const {project,customer,trip,result} = await searchParams;
  if ((project && !uuid.test(project)) || (customer && !uuid.test(customer))) notFound();
  const [{data: rows,error}, event, historical, dispatch] = await Promise.all([
    client.rpc("orbit_tributary_list",{p_project:project ?? null,p_customer:customer ?? null}),
    project ? client.from("projects").select("id,orbit_event_id").eq("id",project).maybeSingle() : null,
    project ? client.from("documents").select("id,external_tax_document_type,external_folio,external_issue_date")
      .eq("project_id",project).is("deleted_at",null).not("external_folio","is",null)
      .order("external_issue_date",{ascending:false}).limit(50) : null,
    project ? client.rpc("orbit_tributary_dispatch_options",{p_project:project}) : null,
  ]);
  if (project && (!event?.data || event.error)) notFound();
  return <main className="space-y-6">
    <header className="rounded-3xl border bg-card p-6 sm:p-8">
      <p className="text-sm font-semibold text-brand">ORBIT · Precertificación</p>
      <h1 className="mt-2 text-3xl font-semibold">Finanzas Tributarias</h1>
      <p className="mt-2 text-sm text-muted">Copia aislada · Sin emisión ni movimientos financieros</p>
      {project && <Link className="mt-3 inline-block text-brand underline" href={`/projects/${project}`}>Volver a Event 360° · {event?.data?.orbit_event_id}</Link>}
      {customer && <Link className="ml-4 text-brand underline" href={`/customers/${customer}`}>Ver cliente</Link>}
    </header>
    {result === "unavailable" && <p role="alert" className="rounded-2xl border p-4">El borrador no está disponible. Verifica la cotización aceptada y las intenciones del evento.</p>}
    {project && !error && <form action={createDraft} className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
      <input type="hidden" name="project" value={project}/>
      <label className="grid gap-1 text-sm">Tipo de DTE<select name="kind" className="rounded-lg border bg-background px-3 py-2"><option value="33">Factura 33</option><option value="39">Boleta 39</option></select></label>
      <button className="rounded-lg bg-brand px-4 py-2 font-semibold text-brand-foreground">Crear borrador</button>
    </form>}
    {project && <section id="dispatch" className="rounded-2xl border bg-card p-5">
      <h2 className="font-semibold">Guía de despacho · Operaciones</h2>
      {result === "dispatch-unavailable" && <p role="alert">No se pudo crear el borrador. Revisa el traslado, sus responsables y el equipamiento seleccionado.</p>}
      {dispatch?.data?.trips?.length && dispatch.data.assets?.length ?
        <form action={createDispatch} className="mt-3 grid max-w-xl gap-3">
          <input type="hidden" name="project" value={project}/>
          <label className="grid">Traslado previsto<select name="trip" defaultValue={trip ?? ""} required className="rounded-lg border bg-background p-2">
           <option value="">Elige un viaje</option>
           {dispatch.data.trips.map((item:{id:string;label:string})=><option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <fieldset><legend>Equipamiento de este viaje</legend>
            {dispatch.data.assets.map((item:{id:string;label:string})=><label className="block" key={item.id}>
              <input type="checkbox" name="assets" value={item.id}/> {item.label}</label>)}
          </fieldset>
          <label className="grid">Destinatario<input name="receiver" required maxLength={100} className="rounded-lg border bg-background p-2"/></label>
          <label className="grid">RUT destinatario<input name="rut" required maxLength={10} className="rounded-lg border bg-background p-2"/></label>
          <label className="grid">RUT transportista<input name="carrier" required maxLength={10} className="rounded-lg border bg-background p-2"/></label>
          <label className="grid">Comuna de destino<input name="city" required maxLength={20} className="rounded-lg border bg-background p-2"/></label>
          <button className="rounded-lg bg-brand px-4 py-2 font-semibold text-brand-foreground">Crear borrador de guía 52</button>
        </form> : <p className="mt-2 text-sm text-muted">Se requiere un viaje previsto con patente y chofer registrados, y equipo asignado al evento.</p>}
    </section>}
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Historial tributario</h2>
      {error ? <p className="mt-2 text-sm text-muted">El registro tributario aislado requiere habilitación.</p> :
       <ul className="mt-3 divide-y">{(rows ?? []).map((row:{id:number;project_id:string;kind:number;state:string}) =>
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <span>{kinds[row.kind]} · {row.state}</span>
          {project && (((row.kind===33 || row.kind===39) && ["BORRADOR","APROBADO"].includes(row.state)) || row.kind===61) &&
            <form action={changeIntention}>
              <input type="hidden" name="id" value={row.id}/><input type="hidden" name="project" value={project}/>
              {row.kind===61 ? <button className="text-brand underline" name="action" value="56">Borrador débito</button> :
               row.state==="BORRADOR" ? <button className="text-brand underline" name="action" value="approve">Aprobar intención</button> :
               <button className="text-brand underline" name="action" value="61">Borrador crédito</button>}
            </form>}
          {[33,39,52].includes(row.kind) && <a className="text-brand underline" href={`/api/tributary/${row.id}/pdf`}>Vista previa PDF</a>}
          <Link className="text-brand underline" href={`/projects/${row.project_id}`}>Abrir evento</Link>
        </li>)}</ul>}
      {!error && !rows?.length && <p className="mt-2 text-sm text-muted">Todavía no hay borradores.</p>}
    </section>
    {project && <section className="rounded-2xl border bg-card p-5">
      <h2 className="font-semibold">Archivo tributario existente</h2>
      {historical?.error ? <p className="text-sm text-muted">No se pudo consultar el archivo.</p> :
        historical?.data?.length ? <ul className="mt-3 divide-y">{historical.data.map(item =>
         <li className="py-2" key={item.id}><Link className="text-brand underline" href={`/api/projects/${project}/documents/${item.id}`}>
          {item.external_tax_document_type} · Folio {item.external_folio} · {item.external_issue_date}
         </Link></li>)}</ul> : <p className="text-sm text-muted">Sin DTE externos asociados.</p>}
    </section>}
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="font-semibold">Folios de factura</h2>
      <p className="mt-2 text-sm">Último informado: 1104, pendiente de conciliación. Inicio propuesto: 2000, sujeto a CAF autorizado por el SII.</p>
    </section>
  </main>;
}
