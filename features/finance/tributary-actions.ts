"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateTributaryDraft, type TributaryLine, type TributaryDiscount } from "./tributary-calculation";

type DteType = "33" | "39" | "52" | "56" | "61";

async function requireAdmin() {
  const session = await createSupabaseServerClient();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) throw new Error("Sesión requerida.");
  const { data: profile } = await session.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) throw new Error("Permiso administrativo requerido.");
  return { admin: createAdminClient(), actorId: auth.user.id };
}

export async function createTributaryDraftAction(input: { projectId: string; dteType: DteType; quotationId?: string; amount?: number }) {
  try {
    const { admin, actorId } = await requireAdmin();
    const { data: project, error } = await admin.from("projects").select("id,customer_id,orbit_event_id,project_type,name,event_date,location,city,customers(id,full_name,company,rut,address,city,email,metadata)").eq("id", input.projectId).is("deleted_at", null).single();
    if (error || !project) throw new Error("Evento no encontrado.");
    let amount = Number.isFinite(input.amount) && Number(input.amount) >= 0 ? Number(input.amount) : 0;
    const quoteQuery = admin.from("quotations")
      .select("id,quotation_number,grand_total,tax_total,global_discount_type,global_discount_value")
      .eq("project_id", project.id).eq("customer_id", project.customer_id)
      .is("deleted_at", null).not("accepted_version_id", "is", null);
    const { data: quote, error: quoteError } = await (input.quotationId
      ? quoteQuery.eq("id", input.quotationId).maybeSingle()
      : quoteQuery.order("updated_at", { ascending: false }).limit(1).maybeSingle());
    if (quoteError || (input.quotationId && !quote)) {
      throw new Error("No se pudo recuperar la cotización aceptada del evento.");
    }

    let lines: TributaryLine[] = [];
    let globalDiscount: TributaryDiscount | undefined;
    if (quote) {
      const { data: items, error: itemError } = await admin.from("quotation_items")
        .select("description,label,quantity,quoted_price,final_unit_price,unit_price,discount_type,discount_value,metadata")
        .eq("quotation_id", quote.id).order("display_order");
      if (itemError || !items?.length) throw new Error("La cotización aceptada no tiene líneas disponibles.");
      amount = Number(quote.grand_total);
      lines = items.map((item) => {
        const description = item.description?.trim() || item.label?.trim();
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.quoted_price ?? item.final_unit_price ?? item.unit_price);
        const discountType = item.discount_type;
        const discount: TributaryDiscount | undefined = discountType === "CLP" || discountType === "PERCENT"
          ? { type: discountType, value: Number(item.discount_value) } : undefined;
        return { description: description ?? "", quantity, unitPrice, exempt: item.metadata?.exempt === true, discount };
      });
      if (quote.global_discount_type === "CLP" || quote.global_discount_type === "PERCENT") {
        globalDiscount = { type: quote.global_discount_type, value: Number(quote.global_discount_value) };
      }
      const { totals } = calculateTributaryDraft(lines, globalDiscount);
      if (totals.vat !== Number(quote.tax_total) || totals.total !== amount) {
        throw new Error("La cotización requiere importar el desglose de descuentos o impuestos antes de crear el borrador.");
      }
    }

    if (!quote) lines = [{ description: project.name || "Servicio BOOMBOX", quantity: 1, unitPrice: Math.round(amount / 1.19), exempt: false }];
    const calculated = calculateTributaryDraft(lines, globalDiscount);
    amount = calculated.totals.total;
    const relationCustomer = Array.isArray((project as any).customers) ? (project as any).customers[0] : (project as any).customers;
    const customerSnapshot = relationCustomer ? { name: relationCustomer.full_name, company: relationCustomer.company, rut: relationCustomer.rut, address: relationCustomer.address, city: relationCustomer.city, email: relationCustomer.email, giro: relationCustomer.metadata?.giro ?? null } : null;
    const key = `PRE-SII|${input.dteType}|${input.projectId}|${quote?.id ?? "none"}`;
    const { data: existing } = await admin.from("tributary_simulations").select("id,status,invoice_number").eq("tributary_draft_key", key).is("deleted_at", null).maybeSingle();
    if (existing) return { ok: true as const, id: existing.id, duplicate: true, status: existing.status };
    const { data: row, error: insertError } = await admin.from("tributary_simulations").insert({
      invoice_number: `PRE-SII-${input.dteType}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      project_id: project.id, amount, status: "DRAFT", record_origin: "PRE_SII",
      tributary_document_type: input.dteType, tributary_draft_key: key,
      tributary_snapshot: {
        source: "ORBIT", mode: "SIMULATION", dteType: input.dteType, projectId: input.projectId,
        quotationId: quote?.id ?? null, amount,
        customer: customerSnapshot,
        event: { name: project.name, eventDate: project.event_date, location: project.location, city: project.city, orbitEventId: project.orbit_event_id },
        condition: "Crédito", quotation: quote,
        globalDiscount: globalDiscount ?? null,
        ...calculated,
      },
      created_by: actorId, updated_by: actorId
    }).select("id,status,invoice_number").single();
    if (insertError) throw insertError;
    revalidatePath("/finance/tributary");
    return { ok: true as const, id: row.id, duplicate: false, status: row.status };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible crear el borrador." };
  }
}

export async function updateTributaryDraftAction(input: {
  draftId: string; revision: string; lines: TributaryLine[]; globalDiscount?: TributaryDiscount;
  customer: Record<string, string>; reference?: Record<string, string>; dispatch?: Record<string, string>; notes?: string;
}) {
  try {
    const { admin, actorId } = await requireAdmin();
    const { data: draft } = await admin.from("tributary_simulations").select("id,status,tributary_snapshot,updated_at").eq("id", input.draftId).eq("record_origin", "PRE_SII").is("deleted_at", null).single();
    if (!draft || draft.status !== "DRAFT" || draft.updated_at !== input.revision) throw new Error("El borrador cambió. Recarga antes de editar.");
    if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 14) throw new Error("Agrega entre 1 y 14 líneas para la plantilla actual.");
    const { lines, totals } = calculateTributaryDraft(input.lines, input.globalDiscount);
    const tributary_snapshot = {
      ...draft.tributary_snapshot, lines, totals, amount: totals.total, globalDiscount: input.globalDiscount ?? null,
      customer: { ...draft.tributary_snapshot?.customer, ...input.customer },
      reference: input.reference ?? null, dispatch: input.dispatch ?? null, notes: input.notes ?? "",
    };
    const { data: saved, error } = await admin.from("tributary_simulations").update({ amount: totals.total, notes: input.notes ?? null, tributary_snapshot, updated_by: actorId, updated_at: new Date().toISOString() })
      .eq("id", draft.id).eq("record_origin", "PRE_SII").eq("status", "DRAFT").eq("updated_at", input.revision).is("deleted_at", null).select("id").maybeSingle();
    if (error) throw error;
    if (!saved) throw new Error("El borrador cambió mientras se guardaba.");
    revalidatePath("/finance/tributary");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible actualizar el borrador." };
  }
}

export async function approveTributaryDraftAction(input: { draftId: string; reason?: string }) {
  try {
    const { admin, actorId } = await requireAdmin();
    const { data: draft } = await admin.from("tributary_simulations").select("id,status,amount,tributary_document_type,tributary_snapshot,updated_at").eq("id", input.draftId).eq("record_origin", "PRE_SII").is("deleted_at", null).single();
    if (!draft || draft.status !== "DRAFT") throw new Error("Sólo se pueden aprobar borradores en estado DRAFT.");
    const snapshot = draft.tributary_snapshot;
    const customer = snapshot?.customer;
    const type = String(draft.tributary_document_type);
    const missing: string[] = [];
    if (!["33", "39", "52", "56", "61"].includes(type)) missing.push("Tipo de documento");
    if (type !== "39" || customer?.rut) {
      const rut = String(customer?.rut ?? "").replace(/[.\s-]/g, "").toUpperCase();
      const match = /^(\d{1,8})([\dK])$/.exec(rut);
      const sum = match ? [...match[1]].reverse().reduce((total, digit, i) => total + Number(digit) * (2 + i % 6), 0) : 0;
      const check = (11 - (sum % 11)) % 11;
      if (!match || Number(match[1]) === 0 || match[2] !== (check === 10 ? "K" : String(check))) missing.push("RUT válido");
    }
    if (type !== "39") {
      for (const [value, label] of [[customer?.company, "Razón social"], [customer?.address, "Dirección"], [customer?.city, "Comuna"], [customer?.giro, "Giro"]]) {
        if (typeof value !== "string" || !value.trim()) missing.push(label);
      }
    }
    if (type === "56" || type === "61") {
      const reference = snapshot?.reference;
      if (!reference?.type || !reference?.folio || !reference?.date || !reference?.reason) missing.push("Referencia al documento original");
    }
    if (type === "52" && !snapshot?.dispatch?.transferReason) missing.push("Motivo del traslado");
    if (!Array.isArray(snapshot?.lines) || !snapshot.lines.length
      || snapshot.lines.some((line: { description?: string; quantity?: number; unitPrice?: number }) =>
        typeof line.description !== "string" || !line.description.trim()
        || !Number.isFinite(line.quantity) || Number(line.quantity) <= 0
        || !Number.isFinite(line.unitPrice) || Number(line.unitPrice) < 0)) missing.push("Detalle de servicios válido");
    const totals = snapshot?.totals;
    if (!totals || ![totals.net, totals.exempt, totals.vat, totals.total].every((n) => Number.isSafeInteger(n) && n >= 0)
      || totals.net + totals.exempt + totals.vat !== totals.total
      || totals.total !== Number(draft.amount)) missing.push("Montos conciliados");
    if (missing.length) throw new Error("Completa antes de aprobar: " + missing.join(", ") + ".");

    const { data: approved, error } = await admin.from("tributary_simulations").update({ status: "PENDING", approved_by: actorId, approved_at: new Date().toISOString(), approval_reason: input.reason ?? "Aprobación interna PRE-SII", updated_by: actorId }).eq("id", input.draftId).eq("record_origin", "PRE_SII").eq("status", "DRAFT").eq("updated_at", draft.updated_at).is("deleted_at", null).select("id").maybeSingle();
    if (error) throw error;
    if (!approved) throw new Error("El borrador cambió durante la aprobación. Vuelve a cargarlo.");
    revalidatePath("/finance/tributary");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible aprobar el borrador." };
  }
}

export async function retryTributaryDriveSyncAction(input: { syncId: string }) {
  try {
    const { admin } = await requireAdmin();
    const { data: row } = await admin.from("tributary_drive_sync_items").select("id,attempt_count").eq("id", input.syncId).single();
    if (!row) throw new Error("Sincronización no encontrada.");
    const { error } = await admin.from("tributary_drive_sync_items").update({ status: "RETRY", attempt_count: Number(row.attempt_count ?? 0) + 1, last_error: null, updated_at: new Date().toISOString() }).eq("id", input.syncId);
    if (error) throw error;
    revalidatePath("/finance/tributary");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible programar el reintento." };
  }
}
