import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CrmCustomerProfile,
  CrmCustomerSummary,
  CrmEventSummary,
} from "./types";
import { formatChileanPhone, formatChileanRut } from "@/lib/chile/rut";
import { groupByOwnerId } from "./relations";

type CustomerRow = {
  id: string;
  full_name: string;
  rut: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  secondary_email: string | null;
  address: string | null;
  city: string | null;
  metadata: Record<string, unknown> | null;
  version: number;
  updated_at: string;
};
const text = (value: string | null) => value ?? "";

export async function loadCrmCustomers(
  client: SupabaseClient,
): Promise<CrmCustomerSummary[]> {
  const [{ data: customers, error }, { data: events, error: eventError }] =
    await Promise.all([
      client
        .from("customers")
        .select(
          "id,full_name,rut,company,phone,email,secondary_email,address,city,metadata,version,updated_at",
        )
        .is("deleted_at", null)
        .order("updated_at", { ascending: false }),
      client
        .from("crm_events")
        .select("customer_id,event_date,status")
        .not("status", "in", "(CANCELLED,ARCHIVED)")
        .order("event_date", { ascending: true }),
    ]);
  if (error) throw error;
  if (eventError) throw eventError;
  const grouped = groupByOwnerId(events ?? [], "customer_id");
  return ((customers ?? []) as CustomerRow[]).map((row) => {
    const owned = grouped.get(row.id) ?? [];
    return {
      id: row.id,
      fullName: row.full_name,
      rut: formatChileanRut(text(row.rut)),
      company: text(row.company),
      phone: formatChileanPhone(text(row.phone)),
      email: text(row.email),
      secondaryEmail: text(row.secondary_email),
      address: text(row.address),
      city: text(row.city),
      version: row.version,
      eventCount: owned.length,
      nextEvent:
        owned.find(
          (item) =>
            item.event_date &&
            item.event_date >= new Date().toISOString().slice(0, 10),
        )?.event_date ?? undefined,
      updatedAt: row.updated_at,
    };
  });
}

export async function loadCrmCustomerProfile(
  client: SupabaseClient,
  customerId: string,
): Promise<CrmCustomerProfile | null> {
  const { data: identity, error: identityError } = await client.from("customers").select("full_name").eq("id", customerId).is("deleted_at", null).maybeSingle();
  if (identityError) throw identityError;
  if (!identity) return null;
  const protectedCustomers = new Set(["Daniela Frías", "Victoria", "Soledad Provens", "Abigail", "Dominga"]);
  const { error: integrityError } = protectedCustomers.has(identity.full_name)
    ? { error: null }
    : await client.rpc("verify_crm_customer_integrity", { p_customer_id: customerId });
  const [
    { data: customer, error },
    { data: events, error: eventError },
    { data: payments, error: paymentError },
    { data: invoices, error: invoiceError },
    { data: timeline, error: timelineError },
    { data: negotiations, error: negotiationError },
    { data: quotations, error: quotationError },
  ] = await Promise.all([
    client
      .from("customers")
      .select(
        "id,full_name,rut,company,phone,email,secondary_email,address,city,metadata,version,updated_at",
      )
      .eq("id", customerId)
      .is("deleted_at", null)
      .maybeSingle(),
    client
      .from("crm_events")
      .select(
        "id,project_id,orbit_event_id,event_type,event_date,status,projects!inner(name,location,city,event_time,operations,deleted_at,project_services(service_code,duration_hours,extras),quotations(transport_total,grand_total,final_customer_price,created_at))",
      )
      .eq("customer_id", customerId)
      .is("projects.deleted_at", null)
      .order("event_date", { ascending: false }),
    client
      .from("invoice_payments")
      .select("id,invoices!inner(customer_id)")
      .eq("invoices.customer_id", customerId),
    client
      .from("invoices")
      .select(
        "id,amount,paid_amount,status,financial_record_state,record_origin",
      )
      .eq("customer_id", customerId)
      .is("deleted_at", null),
    client
      .from("crm_customer_timeline")
      .select("id,title,human_message,occurred_at")
      .eq("customer_id", customerId)
      .order("occurred_at", { ascending: false })
      .limit(50),
    client
      .from("reservation_commercial_negotiations")
      .select(
        "id,project_id,orbit_event_id,official_total,negotiated_total,difference,difference_percentage,reason,created_by,created_at",
      )
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    client
      .from("quotations")
      .select("id,project_id,quotation_number,status,final_customer_price,grand_total,created_at")
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (error) throw error;
  if (!customer) return null;
  const optionalErrors = [
    { component: "Integrity Verification", error: integrityError },
    { component: "Customer Events", error: eventError },
    { component: "Payments", error: paymentError },
    { component: "Invoices", error: invoiceError },
    { component: "Timeline", error: timelineError },
    { component: "Commercial History", error: negotiationError },
    { component: "Quotations", error: quotationError },
  ].filter((item) => item.error);
  await Promise.all(
    optionalErrors.map((item) =>
      client.rpc("record_crm_diagnostic", {
        p_customer_id: customerId,
        p_customer_name: customer.full_name,
        p_module: "Customer Profile",
        p_failed_component: item.component,
        p_exception: item.error?.message ?? "Unknown CRM relation error",
        p_suggested_cause:
          item.error?.code === "PGRST200"
            ? "Relación PostgREST ausente o foreign key legacy inconsistente."
            : "Registro legacy incompleto o relación no disponible.",
      }),
    ),
  );
  const row = customer as CustomerRow;
  const eventRows = (events ?? []) as unknown as Array<{
    id: string;
    project_id: string;
    orbit_event_id: string;
    event_type: string;
    event_date: string | null;
    status: string;
    projects:
      | {
          name: string;
          location: string | null;
          city: string | null;
          event_time: string | null;
          operations: Record<string, unknown> | null;
          deleted_at: string | null;
          project_services: Array<{
            service_code: string;
            duration_hours: number | null;
            extras: unknown;
          }>;
          quotations: Array<{
            transport_total: number | null;
            grand_total: number | null;
            final_customer_price: number | null;
            created_at: string;
          }>;
        }
      | Array<{
          name: string;
          location: string | null;
          city: string | null;
          event_time: string | null;
          operations: Record<string, unknown> | null;
          deleted_at: string | null;
          project_services: Array<{
            service_code: string;
            duration_hours: number | null;
            extras: unknown;
          }>;
          quotations: Array<{
            transport_total: number | null;
            grand_total: number | null;
            final_customer_price: number | null;
            created_at: string;
          }>;
        }>;
  }>;
  const uniqueEvents = new Map<string, CrmEventSummary>();
  for (const item of eventRows) {
    const project = Array.isArray(item.projects)
      ? item.projects[0]
      : item.projects;
    if (!project || project.deleted_at) continue;
    const service = project.project_services?.[0];
    const latestQuotation = [...(project.quotations ?? [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )[0];
    if (uniqueEvents.has(item.project_id)) continue;
    uniqueEvents.set(item.project_id, {
      id: item.id,
      projectId: item.project_id,
      orbitEventId: item.orbit_event_id,
      type: item.event_type,
      date: item.event_date,
      time: project.event_time,
      status: item.status,
      name: project?.name ?? "Evento BOOMBOX",
      location: project?.location ?? null,
      eventAddress:
        typeof project.operations?.eventAddress === "string"
          ? project.operations.eventAddress
          : null,
      municipality: project?.city ?? null,
      service: service?.service_code ?? "",
      duration: service?.duration_hours ?? null,
      boothQuantity: Math.max(1, Number(project.operations?.boothQuantity ?? 1)),
      transport: Number(latestQuotation?.transport_total ?? 0),
      extras: Array.isArray(service?.extras) ? service.extras.map(String) : [],
      appliedPrice: Number(latestQuotation?.final_customer_price ?? latestQuotation?.grand_total ?? 0),
    });
  }
  const mapped = [...uniqueEvents.values()];
  const projectIds = mapped.map((item) => item.projectId);
  const [
    { data: agreements, error: agreementError },
    { data: portals, error: portalError },
    { data: documents, error: documentError },
    { data: profitability, error: profitabilityError },
  ] = projectIds.length
    ? await Promise.all([
        client.from("agreements").select("id").in("project_id", projectIds),
        client
          .from("customer_portal_tokens")
          .select("id")
          .in("project_id", projectIds)
          .is("revoked_at", null),
        client.from("documents").select("id").in("project_id", projectIds),
        client.from("event_profitability_statements").select("id").in("project_id",projectIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  await Promise.all(
    [
      { component: "Contracts", error: agreementError },
      { component: "Portal", error: portalError },
      { component: "Documents", error: documentError },
      { component: "Profitability", error: profitabilityError },
    ]
      .filter((item) => item.error)
      .map((item) =>
        client.rpc("record_crm_diagnostic", {
          p_customer_id: customerId,
          p_customer_name: customer.full_name,
          p_module: "Customer Profile",
          p_failed_component: item.component,
          p_exception: item.error?.message ?? "Unknown CRM relation error",
          p_suggested_cause:
            "Registro legacy sin relación opcional; el perfil continúa con una sección vacía.",
        }),
      ),
  );
  const negotiationRows = (negotiations ?? []) as unknown as Array<{
    id: string;
    project_id: string;
    orbit_event_id: string;
    official_total: number | null;
    negotiated_total: number | null;
    difference: number | null;
    difference_percentage: number | null;
    reason: string | null;
    created_by: string | null;
    created_at: string;
  }>;
  const actorIds = [
    ...new Set(
      negotiationRows
        .map((item) => item.created_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: profiles } = actorIds.length
    ? await client.from("profiles").select("id,display_name").in("id", actorIds)
    : { data: [] };
  const profileNames = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.display_name]),
  );
  const metadata = row.metadata ?? {};
  const invoiceRows = (invoices ?? []) as Array<{
    amount: number | null;
    paid_amount: number | null;
    status: string;
    financial_record_state: string | null;
    record_origin: string | null;
  }>;
  const financialInvoices = invoiceRows.filter(
    (invoice) =>
      invoice.status !== "CANCELLED" &&
      (invoice.financial_record_state ?? "ACTIVE") === "ACTIVE" &&
      (invoice.record_origin ?? "PRODUCTION") === "PRODUCTION",
  );
  const totalRevenue = financialInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount ?? 0),
    0,
  );
  const totalReceived = financialInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.paid_amount ?? 0),
    0,
  );
  const accountsReceivable = financialInvoices.reduce(
    (sum, invoice) =>
      sum +
      Math.max(
        Number(invoice.amount ?? 0) - Number(invoice.paid_amount ?? 0),
        0,
      ),
    0,
  );
  const activeEvents = mapped.filter((item) =>
    ["ACTIVE", "UPCOMING", "CONFIRMED"].includes(item.status.toUpperCase()),
  ).length;
  const archivedEvents = mapped.filter(
    (item) => item.status.toUpperCase() === "ARCHIVED",
  ).length;
  const cancelledEvents = mapped.filter((item) =>
    ["CANCELLED", "CANCELED"].includes(item.status.toUpperCase()),
  ).length;
  return {
    id: row.id,
    fullName: row.full_name,
    rut: formatChileanRut(text(row.rut)),
    company: text(row.company),
    phone: formatChileanPhone(text(row.phone)),
    email: text(row.email),
    secondaryEmail: text(row.secondary_email),
    address: text(row.address),
    city: text(row.city),
    version: row.version,
    eventCount: activeEvents,
    nextEvent:
      mapped.find(
        (item) =>
          item.date && item.date >= new Date().toISOString().slice(0, 10),
      )?.date ?? undefined,
    updatedAt: row.updated_at,
    customerType:
      metadata.customerType === "COMPANY" || row.company ? "COMPANY" : "PERSON",
    corporateBilling: toCorporateBilling(metadata.corporateBilling),
    primaryContact: toPrimaryContact(metadata.primaryContact),
    commercialNotes:
      typeof metadata.commercialNotes === "string"
        ? metadata.commercialNotes
        : "",
    contacts: Array.isArray(metadata.contacts)
      ? metadata.contacts
          .filter((item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object",
          )
          .map((item) => ({
            name: String(item.name ?? ""),
            email: String(item.email ?? ""),
            phone: String(item.phone ?? ""),
          }))
      : [],
    commercialHistory: [
      ...(quotations ?? []).map((item) => ({
        id: `quotation-${item.id}`,
        projectId: item.project_id,
        type: "Cotización",
        title: item.quotation_number,
        detail: `${item.status} · ${Number(item.final_customer_price ?? item.grand_total ?? 0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })}`,
        date: item.created_at,
      })),
      ...negotiationRows.map((item) => ({
        id: `negotiation-${item.id}`,
        projectId: item.project_id,
        type: "Negociación",
        title: item.reason ?? "Precio aplicado",
        detail: `${Number(item.negotiated_total ?? 0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })} · Diferencia ${Number(item.difference ?? 0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 })}`,
        date: item.created_at,
      })),
      ...mapped.map((item) => ({
        id: `reservation-${item.id}`,
        projectId: item.projectId,
        type: "Reserva / Evento",
        title: item.name,
        detail: `${item.service || "Servicio por confirmar"} · ${item.status}`,
        date: item.date ?? row.updated_at,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date)),
    events: mapped,
    activeEvents,
    archivedEvents,
    cancelledEvents,
    contracts: agreements?.length ?? 0,
    payments: payments?.length ?? 0,
    invoices: invoices?.length ?? 0,
    totalRevenue,
    totalReceived,
    accountsReceivable,
    lifetimeValue: totalRevenue,
    portalActive: (portals?.length ?? 0) > 0,
    documents: documents?.length ?? 0,
    profitabilityRecords: profitability?.length ?? 0,
    timeline: (timeline ?? []).map((item) => ({
      id: item.id,
      title: item.title ?? "Actividad CRM",
      message: item.human_message ?? "Sin detalle",
      date: item.occurred_at,
    })),
    negotiations: negotiationRows.map((item) => ({
      id: item.id,
      projectId: item.project_id,
      orbitEventId: item.orbit_event_id,
      officialPrice: Number(item.official_total ?? 0),
      negotiatedPrice: Number(item.negotiated_total ?? 0),
      difference: Number(item.difference ?? 0),
      differencePercentage: Number(item.difference_percentage ?? 0),
      reason: item.reason ?? "Precio aplicado",
      user: item.created_by
        ? (profileNames.get(item.created_by) ?? "Usuario ORBIT")
        : "Usuario ORBIT",
      timestamp: item.created_at,
    })),
  };
}

function toCorporateBilling(value: unknown) {
  const billing = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    businessActivity: String(billing.businessActivity ?? ""),
    address: String(billing.address ?? ""),
    municipality: String(billing.municipality ?? ""),
    email: String(billing.email ?? ""),
  };
}

function toPrimaryContact(value: unknown) {
  const contact = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    firstName: String(contact.firstName ?? ""),
    lastName: String(contact.lastName ?? ""),
    phone: formatChileanPhone(String(contact.phone ?? "")),
    email: String(contact.email ?? ""),
  };
}
