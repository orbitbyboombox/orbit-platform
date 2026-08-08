import { notFound } from "next/navigation";
import { CustomerSigningExperience } from "@/features/projects/signing/customer-signing-experience";
import { openSigningAgreement } from "@/features/projects/signing/digital-signature.service";

export default async function SignAgreementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const agreement = await openSigningAgreement(token); if (!agreement) notFound();
  const project = agreement.projects as unknown as { name:string;event_date:string;customers:{full_name:string};project_services:Array<{service_code:string;duration_hours:number|null;extras:unknown}>;quotations?:Array<{final_customer_price:number}> };
  const rendered = agreement.rendered_contract as Record<string,unknown>; const rawClauses = Array.isArray(rendered.clauses) ? rendered.clauses : [];
  const clauses = rawClauses.map((item,index)=>{const value=item as Record<string,unknown>;return{title:typeof value.title==="string"?value.title:`Condición ${index+1}`,content:typeof value.content==="string"?value.content:"Revisa esta condición con BOOMBOX."};});
  const extras=project.project_services.flatMap((item)=>Array.isArray(item.extras)?item.extras.filter((extra):extra is string=>typeof extra==="string"):[]);
  const total=Number(project.quotations?.[0]?.final_customer_price??0);
  return <CustomerSigningExperience agreementVersion={agreement.template_version} clauses={clauses} customer={project.customers.full_name} eventDate={new Intl.DateTimeFormat("es-CL",{dateStyle:"long",timeZone:"UTC"}).format(new Date(`${project.event_date}T12:00:00Z`))} extras={extras.join(" · ")||"Sin extras"} hours={project.project_services.map((item)=>item.duration_hours?`${item.duration_hours} horas`:null).filter(Boolean).join(" · ")||"Por confirmar"} project={project.name} service={project.project_services.map((item)=>item.service_code).join(" · ")||"Experiencia BOOMBOX"} token={token} total={total} transport={extras.some((extra)=>extra.toLocaleLowerCase("es-CL").includes("transport"))?"Incluido en el total":"No aplica"}/>;
}
