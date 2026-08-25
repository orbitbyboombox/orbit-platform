"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  transitionReservationLifecycleAction,
  type ReservationLifecycleAction,
} from "@/features/projects/actions/reservation-lifecycle.actions";
import { synchronizeConfirmedReservationCalendar } from "@/features/connectors/google-calendar/application/google-calendar-sync.service";
import { synchronizeConfirmedReservationDrive } from "@/features/connectors/google-drive/application/google-drive-sync.service";
import { uploadReservationDocumentToDrive } from "@/features/connectors/google-drive/application/google-drive-document-routing.service";
import type { GoogleDriveDocumentKind } from "@/features/connectors/google-drive/types/google-drive-live.types";
import { createCustomerPortalAccess } from "@/features/customer-portal/customer-portal.service";
import { normalizeChileanPhone, requireValidChileanRut } from "@/lib/chile/rut";
import { normalizeOptionalEmail } from "@/lib/email/recipients";
const message = (error: unknown, fallback: string) =>
  error instanceof Error && !/coerce|json object|pgrst|schema|constraint|violates|column/i.test(error.message) ? error.message : fallback;
async function founderClient() {
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Sesión requerida.");
  const { data: profile, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (error) throw error;
  if (!["CEO", "ADMINISTRATOR"].includes(profile.role))
    throw new Error("Solo Founder o Administración puede gestionar clientes.");
  return { client, user: data.user };
}
export async function createCrmCustomerAction(input: {
  customerType: "PERSON" | "COMPANY";
  fullName: string;
  rut: string;
  company: string;
  phone: string;
  email: string;
  secondaryEmail: string;
  address: string;
  businessActivity: string;
  billingAddress: string;
  billingMunicipality: string;
  billingEmail: string;
  primaryContactFirstName: string;
  primaryContactLastName: string;
  primaryContactPhone: string;
  primaryContactEmail: string;
}) {
  try {
    const { client, user } = await founderClient();
    if (!input.fullName.trim() || !input.rut.trim())
      throw new Error("Nombre y RUT son obligatorios.");
    if (
      input.customerType === "COMPANY" &&
      (!input.company.trim() ||
        !input.billingAddress.trim() ||
        !input.billingMunicipality.trim() ||
        !input.billingEmail.trim() ||
        !input.primaryContactFirstName.trim() ||
        !input.primaryContactLastName.trim() ||
        !input.primaryContactPhone.trim() ||
        !input.primaryContactEmail.trim())
    )
      throw new Error("Completa la facturación y el contacto principal de la empresa.");
    const normalized = requireValidChileanRut(input.rut);
    const { data: existing, error: lookup } = await client
      .from("customers")
      .select("id")
      .is("deleted_at", null)
      .eq("metadata->>normalizedRut", normalized)
      .maybeSingle();
    if (lookup) throw lookup;
    if (existing) throw new Error("Ya existe un cliente con este RUT.");
    const { data, error } = await client
      .from("customers")
      .insert({
        full_name: input.fullName.trim(),
        rut: normalized,
        company: input.company.trim() || null,
        phone: normalizeChileanPhone(input.phone) || null,
        email: normalizeOptionalEmail(input.email, "email principal"),
        secondary_email: normalizeOptionalEmail(input.secondaryEmail, "email secundario / CC"),
        address: input.address.trim() || null,
        metadata: {
          normalizedRut: normalized,
          customerType: input.customerType,
          corporateBilling:
            input.customerType === "COMPANY"
              ? {
                  businessActivity: input.businessActivity.trim(),
                  address: input.billingAddress.trim(),
                  municipality: input.billingMunicipality.trim(),
                  email: input.billingEmail.trim().toLowerCase(),
                }
              : null,
          primaryContact:
            input.customerType === "COMPANY"
              ? {
                  firstName: input.primaryContactFirstName.trim(),
                  lastName: input.primaryContactLastName.trim(),
                  phone: normalizeChileanPhone(input.primaryContactPhone),
                  email: input.primaryContactEmail.trim().toLowerCase(),
                }
              : null,
        },
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    revalidatePath("/customers");
    return { ok: true as const, id: data.id };
  } catch (error) {
    return {
      ok: false as const,
      error: message(error, "No fue posible crear el cliente."),
    };
  }
}
export async function updateCrmCustomerAction(input: {
  id: string;
  customerType: "PERSON" | "COMPANY";
  fullName: string;
  rut: string;
  company: string;
  phone: string;
  email: string;
  secondaryEmail: string;
  address: string;
  commercialNotes: string;
  contacts: Array<{ name: string; email: string; phone: string }>;
  businessActivity: string;
  billingAddress: string;
  billingMunicipality: string;
  billingEmail: string;
  primaryContactFirstName: string;
  primaryContactLastName: string;
  primaryContactPhone: string;
  primaryContactEmail: string;
  reason: string;
}) {
  try {
    const { client, user } = await founderClient();
    if (!input.reason.trim()) throw new Error("Registra el motivo del cambio.");
    if (
      input.customerType === "COMPANY" &&
      (!input.company.trim() ||
        !input.billingAddress.trim() ||
        !input.billingMunicipality.trim() ||
        !input.billingEmail.trim() ||
        !input.primaryContactFirstName.trim() ||
        !input.primaryContactLastName.trim() ||
        !input.primaryContactPhone.trim() ||
        !input.primaryContactEmail.trim())
    )
      throw new Error("Completa la facturación y el contacto principal de la empresa.");
    const normalized = requireValidChileanRut(input.rut);
    const { data: current, error: readError } = await client
      .from("customers")
      .select("metadata,projects(id,status,deleted_at)")
      .eq("id", input.id)
      .single();
    if (readError) throw readError;
    const { error } = await client
      .from("customers")
      .update({
        full_name: input.fullName.trim(),
        rut: normalized,
        company: input.company.trim() || null,
        phone: normalizeChileanPhone(input.phone) || null,
        email: normalizeOptionalEmail(input.email, "email principal"),
        secondary_email: normalizeOptionalEmail(input.secondaryEmail, "email secundario / CC"),
        address: input.address.trim() || null,
        metadata: {
          ...current.metadata,
          normalizedRut: normalized,
          customerType: input.customerType,
          corporateBilling:
            input.customerType === "COMPANY"
              ? {
                  businessActivity: input.businessActivity.trim(),
                  address: input.billingAddress.trim(),
                  municipality: input.billingMunicipality.trim(),
                  email: input.billingEmail.trim().toLowerCase(),
                }
              : null,
          primaryContact:
            input.customerType === "COMPANY"
              ? {
                  firstName: input.primaryContactFirstName.trim(),
                  lastName: input.primaryContactLastName.trim(),
                  phone: normalizeChileanPhone(input.primaryContactPhone),
                  email: input.primaryContactEmail.trim().toLowerCase(),
                }
              : null,
          commercialNotes: input.commercialNotes,
          contacts: input.contacts,
        },
        approval_reason: input.reason,
        updated_by: user.id,
      })
      .eq("id", input.id)
      .is("deleted_at", null);
    if (error) throw error;
    const projectIds = (current.projects ?? []).filter((project) => !project.deleted_at && !["CANCELLED", "CANCELED", "ARCHIVED"].includes(String(project.status).toUpperCase())).map((project) => project.id);
    await Promise.all(projectIds.flatMap((projectId) => [
      synchronizeConfirmedReservationCalendar({ client, projectId, actorId: user.id, operation: "UPSERT", requireCommercialReadiness: false }),
      synchronizeConfirmedReservationDrive({ client, projectId, actorId: user.id, recordTimeline: true }),
    ]));
    revalidatePath(`/customers/${input.id}`);
    revalidatePath("/customers");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: message(error, "No fue posible actualizar el cliente."),
    };
  }
}

export async function getCrmDocumentUrlAction(documentId: string) {
  try {
    const { client } = await founderClient();
    const { data, error } = await client.from("documents").select("storage_bucket,storage_path").eq("id", documentId).is("deleted_at", null).single();
    if (error) throw error;
    if (!data.storage_path) throw new Error("El documento todavía no tiene un archivo disponible.");
    const { data: signed, error: signedError } = await client.storage.from(data.storage_bucket || "orbit-documents").createSignedUrl(data.storage_path, 300);
    if (signedError) throw signedError;
    return { ok: true as const, url: signed.signedUrl };
  } catch (error) {
    return { ok: false as const, error: message(error, "No fue posible abrir el documento.") };
  }
}

export async function openCrmCustomerPortalAction(projectId: string) {
  try {
    const { user } = await founderClient();
    return {
      ok: true as const,
      ...(await createCustomerPortalAccess(projectId, user.id, {
        preserveExisting: true,
      })),
    };
  } catch (error) {
    return {
      ok: false as const,
      error: message(error, "No fue posible abrir el Portal Cliente."),
    };
  }
}

export async function replaceCrmDocumentAction(formData: FormData) {
  try {
    const { client } = await founderClient();
    const documentId = String(formData.get("documentId"));
    const projectId = String(formData.get("projectId"));
    const reason = String(formData.get("reason") || "").trim();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Selecciona el documento de reemplazo.");
    if (file.size > 20 * 1024 * 1024) throw new Error("El documento no puede superar 20 MB.");
    if (!reason) throw new Error("El motivo es obligatorio.");
    const admin = createAdminClient();
    const { data: document, error } = await admin.from("documents").select("document_type,projects!inner(id,event_date,customers!inner(full_name))").eq("id", documentId).eq("project_id", projectId).is("deleted_at", null).single();
    if (error) throw error;
    const project = Array.isArray(document.projects) ? document.projects[0] : document.projects;
    const customer = Array.isArray(project.customers) ? project.customers[0] : project.customers;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
    const storagePath = `${projectId}/crm-documents/${crypto.randomUUID()}.${extension}`;
    const { error: storageError } = await admin.storage.from("orbit-documents").upload(storagePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
    if (storageError) throw storageError;
    const kind = documentKind(document.document_type);
    const drive = await uploadReservationDocumentToDrive({ client: admin, projectId, customerName: customer.full_name, eventDate: project.event_date, kind, name: file.name, mimeType: file.type || "application/octet-stream", bytes });
    const { error: replaceError } = await client.rpc("replace_crm_document", { p_document_id: documentId, p_storage_path: storagePath, p_checksum: createHash("sha256").update(bytes).digest("hex"), p_drive_file_id: drive.id, p_reason: reason });
    if (replaceError) throw replaceError;
    revalidateCustomerSurfaces(projectId);
    return { ok: true as const };
  } catch (error) { return { ok: false as const, error: message(error, "No fue posible reemplazar el documento.") }; }
}

function documentKind(type: string): GoogleDriveDocumentKind {
  if (type === "QUOTATION") return "QUOTATION";
  if (["SIGNED_AGREEMENT", "COMMERCIAL_DOCUMENT"].includes(type)) return "CONTRACT";
  if (type === "PAYMENT_RECEIPT") return "PAYMENT_PROOF";
  return "OTHER_DOCUMENT";
}
function revalidateCustomerSurfaces(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  ["/customers", "/events", "/finance", "/finance/receivables", "/reports", "/notifications"].forEach((path) => revalidatePath(path));
}
export async function archiveCrmCustomerAction(id: string, reason: string) {
  try {
    const { client, user } = await founderClient();
    if (reason.trim().length < 3)
      throw new Error("El motivo de archivo es obligatorio.");
    const { count, error: eventsError } = await client
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id)
      .is("deleted_at", null);
    if (eventsError) throw eventsError;
    if ((count ?? 0) > 0)
      throw new Error(
        "Archiva o cancela primero los eventos activos del cliente.",
      );
    const { error } = await client
      .from("customers")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        approval_reason: reason,
        updated_by: user.id,
      })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) throw error;
    revalidatePath("/customers");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: message(error, "No fue posible archivar el cliente."),
    };
  }
}
export async function mergeCrmCustomersAction(
  masterCustomerId: string,
  duplicateCustomerId: string,
  reason: string,
) {
  try {
    const { client } = await founderClient();
    const { data, error } = await client.rpc("merge_crm_customers", {
      p_master_customer_id: masterCustomerId,
      p_duplicate_customer_id: duplicateCustomerId,
      p_reason: reason,
    });
    if (error) throw error;
    revalidatePath("/customers");
    revalidatePath(`/customers/${masterCustomerId}`);
    return { ok: true as const, result: data };
  } catch (error) {
    return {
      ok: false as const,
      error: message(error, "No fue posible fusionar los clientes."),
    };
  }
}

export async function transitionCrmEventAction(input: {
  customerId: string;
  projectId: string;
  action: Extract<ReservationLifecycleAction, "ARCHIVE" | "PERMANENT_DELETE">;
  reason: string;
}) {
  const result = await transitionReservationLifecycleAction(
    input.projectId,
    input.action,
    input.reason,
  );
  revalidatePath(`/customers/${input.customerId}`);
  revalidatePath("/customers");
  revalidatePath("/events");
  return result;
}

export async function updateCrmEventAction(input: {
  customerId: string;
  projectId: string;
  date: string;
  time: string;
  serviceEndAt?: string;
  staffCallAt?: string;
  type: string;
  location: string;
  eventAddress?: string;
  municipality: string;
  service: string;
  duration: string;
  boothQuantity?: string;
  transport: string;
  extras?: string;
  appliedPrice?: string;
  reason: string;
}) {
  try {
    const { client, user } = await founderClient();
    const { error } = await client.rpc("update_crm_event_from_customer_profile", {
      p_project_id: input.projectId,
      p_changes: {
        date: input.date,
        time: input.time,
        ...(input.date && input.time && input.serviceEndAt
          ? {
              serviceStartLocal: `${input.date}T${input.time}`,
              serviceEndLocal: input.serviceEndAt,
              staffCallLocal: input.staffCallAt || "",
            }
          : {}),
        type: input.type,
        location: input.location,
        ...(input.eventAddress !== undefined
          ? { eventAddress: input.eventAddress }
          : {}),
        municipality: input.municipality,
        service: input.service,
        duration: input.duration,
        ...(input.boothQuantity !== undefined
          ? { boothQuantity: input.boothQuantity }
          : {}),
        transport: input.transport,
        ...(input.extras !== undefined ? { extras: input.extras.split(",").map((item) => item.trim()).filter(Boolean) } : {}),
        ...(input.appliedPrice !== undefined ? { appliedPrice: input.appliedPrice } : {}),
      },
      p_reason: input.reason,
    });
    if (error) throw error;
    const synchronization = await Promise.allSettled([
      synchronizeConfirmedReservationCalendar({ client, projectId: input.projectId, actorId: user.id, operation: "UPSERT", requireCommercialReadiness: false }),
      synchronizeConfirmedReservationDrive({ client, projectId: input.projectId, actorId: user.id, recordTimeline: true }),
    ]);
    revalidatePath(`/customers/${input.customerId}`);
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath("/projects");
    revalidatePath("/events");
    revalidatePath("/operations");
    revalidatePath("/finance/collections");
    revalidateCustomerSurfaces(input.projectId);
    const failedSynchronizations = synchronization.filter(
      (result) => result.status === "rejected",
    ).length;
    return {
      ok: true as const,
      message: "✓ Evento actualizado correctamente",
      warning:
        failedSynchronizations > 0
          ? "El Evento fue actualizado. Google Workspace quedó pendiente de sincronización."
          : undefined,
    };
  } catch (error) {
    console.error("updateCrmEventAction failed", error);
    return {
      ok: false as const,
      error: message(error, "No fue posible actualizar el evento."),
    };
  }
}

export async function duplicateCrmEventAction(input: {
  customerId: string;
  projectId: string;
  copyStaff: boolean;
  reason: string;
}) {
  try {
    const { client } = await founderClient();
    const { data, error } = await client.rpc("duplicate_crm_event", {
      p_project_id: input.projectId,
      p_copy_staff: input.copyStaff,
      p_reason: input.reason,
    });
    if (error) throw error;
    revalidatePath(`/customers/${input.customerId}`);
    revalidatePath("/projects");
    revalidatePath("/events");
    return { ok: true as const, projectId: String(data) };
  } catch (error) {
    return {
      ok: false as const,
      error: message(error, "No fue posible duplicar el evento."),
    };
  }
}
