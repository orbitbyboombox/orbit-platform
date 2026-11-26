import Link from "next/link";

export function TributaryLink({project,customer}:{project?:string;customer?:string}) {
  if (process.env.ORBIT_ENVIRONMENT !== "preview" || process.env.ORBIT_TRIBUTARY_PREVIEW !== "true") return null;
  const search = new URLSearchParams();
  if(project) search.set("project",project);
  if(customer) search.set("customer",customer);
  const query = search.toString();
  return <Link className="mb-3 inline-flex rounded-lg border bg-card px-3 py-2 text-sm font-semibold text-brand"
    href={`/finance/tributary${query ? "?" + query : ""}`}>
    {project ? "Documentos tributarios del evento" : customer ? "Historial tributario del cliente" : "Finanzas Tributarias"}
  </Link>;
}
