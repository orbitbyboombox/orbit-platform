"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { propagateCanonicalEventChange } from "@/features/projects/operations/canonical-event-propagation.service";
import { synchronizeConfirmedReservationDrive } from "@/features/connectors/google-drive/application/google-drive-sync.service";

export type GlobalEventService = {
  id: string;
  code: string;
  duration: number;
  extras: string[];
  removed?: boolean;
};

export type GlobalEventItem = {
  id?: string;
  itemType: "SERVICE" | "EXTRA" | "TRANSPORT";
  code: string;
  label: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
};

function formatChileDateTime(value: string | null | undefined) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour === "24" ? "00" : map.hour}:${map.minute}`;
}

export async function loadGlobalEventEditorAction(projectId: string) {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Debes iniciar sesión.");
  const { data: allowed, error: permissionError } = await client.rpc("can_administer");
  if (permissionError || allowed !== true) throw new Error("Acceso reservado a Administración.");

  const [{ data: project, error: projectError }, { data: services, error: servicesError }, { data: quotation, error: quotationError }, { data: invoice, error: invoiceError }, { data: schedule, error: scheduleError }] = await Promise.all([
    client.from("projects").select("id,name,version,event_date,event_time,location,city,operations").eq("id", projectId).is("deleted_at", null).single(),
    client.from("project_services").select("id,service_code,duration_hours,extras").eq("project_id", projectId).order("id"),
    client.from("quotations").select("id,status,version,subtotal,transport_total,discount_total,tax_total,grand_total,final_customer_price,deposit_percent,project_id").eq("project_id", projectId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("invoices").select("id,status,amount,paid_amount,closed_at").eq("project_id", projectId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("project_operational_contracts").select("service_start_at,service_end_at,staff_arrival_at").eq("project_id", projectId).maybeSingle(),
  ]);
  if (projectError || !project) throw projectError ?? new Error("Evento no encontrado.");
  if (servicesError) throw servicesError;
  if (quotationError) throw quotationError;
  if (invoiceError) throw invoiceError;
  if (scheduleError) throw scheduleError;

  const { data: items, error: itemsError } = quotation
    ? await client.from("quotation_items").select("id,item_type,code,label,quantity,unit_price,final_unit_price,final_total,discount_value").eq("quotation_id", quotation.id).order("display_order").order("id")
    : { data: [], error: null };
  if (itemsError) throw itemsError;
  const operation = (project.operations ?? {}) as Record<string, unknown>;
  return {
    project: {
      id: project.id,
      name: project.name ?? "",
      version: Number(project.version ?? 0),
      eventDate: project.event_date ?? "",
      eventTime: project.event_time?.slice(0, 5) ?? "",
      location: project.location ?? "",
      city: project.city ?? "",
      eventAddress: typeof operation.eventAddress === "string" ? operation.eventAddress : "",
      notes: typeof operation.notes === "string" ? operation.notes : "",
    },
    schedule: {
      serviceStartLocal: formatChileDateTime(schedule?.service_start_at),
      serviceEndLocal: formatChileDateTime(schedule?.service_end_at),
      staffCallLocal: formatChileDateTime(schedule?.staff_arrival_at),
    },
    services: (services ?? []).map((service) => ({
      id: service.id,
      code: service.service_code ?? "",
      duration: Number(service.duration_hours ?? 0),
      extras: Array.isArray(service.extras) ? service.extras.map(String) : [],
    })) as GlobalEventService[],
    quotation: quotation ? {
      id: quotation.id,
      status: quotation.status,
      version: Number(quotation.version ?? 0),
      subtotal: Number(quotation.subtotal ?? 0),
      transport: Number(quotation.transport_total ?? 0),
      discount: Number(quotation.discount_total ?? 0),
      tax: Number(quotation.tax_total ?? 0),
      total: Number(quotation.final_customer_price ?? quotation.grand_total ?? 0),
      depositPercent: Number(quotation.deposit_percent ?? 50),
      items: (items ?? []).map((item) => ({
        id: item.id,
        itemType: (item.item_type === "SERVICE" || item.item_type === "TRANSPORT" ? item.item_type : "EXTRA") as GlobalEventItem["itemType"],
        code: item.code ?? "",
        label: item.label ?? "",
        quantity: Number(item.quantity ?? 1),
        unitPrice: Number(item.final_unit_price ?? item.unit_price ?? 0),
        discount: Number(item.discount_value ?? 0),
      })) as GlobalEventItem[],
    } : null,
    invoice: invoice ? {
      id: invoice.id,
      status: invoice.status,
      amount: Number(invoice.amount ?? 0),
      paid: Number(invoice.paid_amount ?? 0),
      closed: Boolean(invoice.closed_at) || invoice.status === "PAID",
    } : null,
  };
}

export async function updateGlobalEventEditorAction(input: {
  projectId: string;
  expectedVersion: number;
  reason: string;
  project: { name: string; eventDate: string; eventTime: string; location: string; city: string; eventAddress: string; notes: string };
  services: GlobalEventService[];
  quotation?: { items: GlobalEventItem[]; discount: number; transport: number; vatPercent: number };
  schedule?: { serviceStartLocal?: string; serviceEndLocal?: string; staffCallLocal?: string };
}) {
  try {
    const client = await createSupabaseServerClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) throw new Error("Debes iniciar sesión.");
    if (input.reason.trim().length < 3) throw new Error("El motivo del cambio es obligatorio.");
    if (!input.services.length) throw new Error("El evento debe conservar al menos un servicio.");
    const { data, error } = await client.rpc("update_global_event_editor", {
      p_project_id: input.projectId,
      p_expected_version: input.expectedVersion,
      p_reason: input.reason.trim(),
      p_changes: {
        name: input.project.name.trim(), eventDate: input.project.eventDate, eventTime: input.project.eventTime,
        location: input.project.location.trim(), city: input.project.city.trim(),
        eventAddress: input.project.eventAddress.trim(), notes: input.project.notes,
        services: input.services.map((service) => ({ id: service.id || null, code: service.code.trim(), duration: service.duration, extras: service.extras, removed: Boolean(service.removed) })),
        ...(input.quotation ? { items: input.quotation.items, discount: input.quotation.discount, transport: input.quotation.transport, vatPercent: input.quotation.vatPercent } : {}),
        ...(input.schedule ?? {}),
      },
    });
    if (error) throw error;
    const propagation = await propagateCanonicalEventChange({ client, projectId: input.projectId, actorId: auth.user.id });
    const drive = await Promise.allSettled([
      synchronizeConfirmedReservationDrive({ client, projectId: input.projectId, actorId: auth.user.id, recordTimeline: true }),
    ]);
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath("/events");
    revalidatePath("/operations");
    revalidatePath("/finance/collections");
    return {
      ok: true as const,
      data,
      message: propagation.status === "SYNCHRONIZED" && drive.every((result) => result.status === "fulfilled")
        ? "Evento actualizado y sincronizado. Los pagos históricos fueron conservados."
        : "Evento actualizado. Una integración quedó pendiente de sincronización; revisa el estado antes de repetir.",
    };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible actualizar el evento." };
  }
}
