import { ProjectsPage } from "@/features/projects/components/projects-page";
import { SupabaseCustomerRepository } from "@/features/projects/infrastructure";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadActiveMunicipalities } from "@/features/settings/master-data/municipality-master-data";

export default async function ProjectsRoute() {
  const client = await createSupabaseServerClient();
  const repository = new SupabaseCustomerRepository(client);
  const { data: auth } = await client.auth.getUser();
  const [projects, commercialPricesResult, servicesResult, venuesResult, municipalities, profileResult, crmCustomersResult, crmEventsResult] = await Promise.all([
    repository.findAll(),
    client.from("commercial_prices").select("category,code,label,duration_hours,destination,unit_price,pricing_status,rules").eq("enabled", true).is("deleted_at", null),
    client.from("master_data_entries").select("code,label,display_order,configuration").eq("domain", "SERVICES").eq("enabled", true).order("display_order"),
    client.from("master_data_entries").select("configuration").eq("domain", "SYSTEM_PARAMETERS").eq("code", "EVENT_VENUES").eq("enabled", true).maybeSingle(),
    loadActiveMunicipalities(client),
    auth.user ? client.from("profiles").select("role").eq("id", auth.user.id).single() : Promise.resolve({ data: null, error: null }),
    client.from("customers").select("id,full_name,rut,email,secondary_email,phone,company,address,city,metadata").is("deleted_at",null).order("updated_at",{ascending:false}),
    client.from("crm_events").select("id,customer_id,event_type,event_date,status,project_id").order("event_date",{ascending:false}),
  ]);
  if (commercialPricesResult.error) throw commercialPricesResult.error;
  if (servicesResult.error) throw servicesResult.error;
  if (venuesResult.error) throw venuesResult.error;
  if (crmCustomersResult.error) throw crmCustomersResult.error;
  if (crmEventsResult.error) throw crmEventsResult.error;
  const commercialPrices = (commercialPricesResult.data ?? []).map((price) => ({
    category: price.category as "SERVICE" | "EXTRA" | "TRANSPORT",
    code: price.code,
    label: price.label,
    durationHours: price.duration_hours,
    destination: price.destination,
    unitPrice: price.unit_price == null ? null : Number(price.unit_price),
    pricingStatus: price.pricing_status as "DEFINED" | "REQUIRES_QUOTE",
    rules: (price.rules ?? {}) as Record<string, unknown>,
  }));
  const configuration = (venuesResult.data?.configuration ?? {}) as { venues?: Array<{ name?: unknown; municipality?: unknown; province?: unknown; surcharge?: unknown }> };
  const venues = (configuration.venues ?? []).flatMap((venue) => typeof venue.name === "string" && typeof venue.municipality === "string" && typeof venue.province === "string" && (venue as { enabled?: unknown }).enabled !== false ? [{ name: venue.name, municipality: venue.municipality, province: venue.province, surcharge: Number(venue.surcharge ?? 0) }] : []);
  const services = (servicesResult.data ?? []).map((service) => {
    const config = (service.configuration ?? {}) as Record<string, unknown>;
    const basePrice = commercialPrices.find((price) => price.category === "SERVICE" && price.code === service.code);
    const extras = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    return {
      code: service.code,
      name: service.label,
      displayOrder: service.display_order,
      minimumHours: Number(config.minimumHours ?? config.defaultDuration ?? basePrice?.durationHours ?? 2),
      maximumHours: Number(config.maximumHours ?? config.minimumHours ?? config.defaultDuration ?? basePrice?.durationHours ?? 4),
      additionalHourPrice: config.additionalHourPrice == null ? Number(basePrice?.rules?.additionalHourPrice ?? 0) : Number(config.additionalHourPrice),
      compatibleExtras: extras(config.compatibleExtras ?? basePrice?.rules?.compatibleExtras),
      defaultExtras: extras(config.defaultExtras ?? basePrice?.rules?.defaultExtras),
      behavior: String(config.behavior ?? basePrice?.rules?.behavior ?? "SELECTABLE"),
    };
  });
  const canNegotiate = ["CEO", "ADMINISTRATOR", "SALES"].includes(profileResult.data?.role ?? "");
  const crmCustomers=(crmCustomersResult.data??[]).map(customer=>{const metadata=(customer.metadata??{})as Record<string,unknown>;const contacts=Array.isArray(metadata.contacts)?metadata.contacts.filter((item):item is Record<string,unknown>=>Boolean(item)&&typeof item==="object").map(item=>({name:String(item.name??item.fullName??"Contacto"),email:String(item.email??""),phone:String(item.phone??"")})):[];return{id:customer.id,name:customer.full_name,rut:customer.rut??"",email:customer.email??"",secondaryEmail:customer.secondary_email??"",phone:customer.phone??"",company:customer.company??"",address:customer.address??"",city:customer.city??"",commercialNotes:typeof metadata.commercialNotes==="string"?metadata.commercialNotes:"",contacts,previousEvents:(crmEventsResult.data??[]).filter(event=>event.customer_id===customer.id).map(event=>({id:event.id,projectId:event.project_id,type:event.event_type,date:event.event_date,status:event.status}))}});
  return <ProjectsPage canNegotiate={canNegotiate} commercialPrices={commercialPrices} crmCustomers={crmCustomers} initialProjects={projects} municipalities={municipalities} services={services} venues={venues} />;
}
