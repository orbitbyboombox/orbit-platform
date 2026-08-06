import { notFound } from "next/navigation";
import { CustomerSigningExperience } from "@/features/projects/signing/customer-signing-experience";
import { openSigningAgreement } from "@/features/projects/signing/digital-signature.service";

export default async function SignAgreementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const agreement = await openSigningAgreement(token); if (!agreement) notFound();
  const project = agreement.projects as unknown as { name:string;event_date:string;customers:{full_name:string};project_services:Array<{service_code:string}> };
  const rendered = agreement.rendered_contract as Record<string,unknown>; const rawClauses = Array.isArray(rendered.clauses) ? rendered.clauses : [];
  const clauses = rawClauses.map((item,index)=>{const value=item as Record<string,unknown>;return{title:typeof value.title==="string"?value.title:`Condición ${index+1}`,content:typeof value.content==="string"?value.content:"Revisa esta condición con BOOMBOX."};});
  return <CustomerSigningExperience agreementVersion={agreement.template_version} clauses={clauses} customer={project.customers.full_name} eventDate={new Intl.DateTimeFormat("es-CL",{dateStyle:"long",timeZone:"UTC"}).format(new Date(`${project.event_date}T12:00:00Z`))} project={project.name} service={project.project_services.map((item)=>item.service_code).join(" · ")||"Experiencia BOOMBOX"} token={token}/>;
}
