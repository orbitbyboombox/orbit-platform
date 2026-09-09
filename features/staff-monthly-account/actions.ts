"use server";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { loadPortalSession } from "@/features/portal-authentication/portal-auth.service";
import {
  mapStaffMonthlyAccount,
  monthlyBoletaPath,
  monthlyReceiptPath,
  monthlySettlementPath,
  STAFF_MONTHLY_ACCOUNT_SELECT,
} from "./model";
import { syncStaffDocumentArchive } from "./drive-archive.service";
import { createStaffMonthlySettlementPdf } from "./settlement-pdf";
const allowed = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const extensionMime = new Map([
  ["pdf", "application/pdf"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);
const fileFrom = (form: Pick<FormData, "get">) => {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size)
    throw new Error("Adjunta un PDF o imagen.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "",
    mime = allowed.has(file.type) ? file.type : extensionMime.get(extension);
  if (!mime || file.size > 15 * 1024 * 1024)
    throw new Error("Archivo inválido o superior a 15 MB.");
  return { file, mime };
};
const refresh = () => {
  revalidatePath("/staff-portal");
  revalidatePath("/resources/staff");
};
const errorInfo = (error: unknown) => {
  const value =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  return {
    name: error instanceof Error ? error.name : "SUPABASE_ERROR",
    message:
      error instanceof Error
        ? error.message
        : String(value.message ?? "Error desconocido"),
    code: String(value.code ?? ""),
    details: String(value.details ?? ""),
    hint: String(value.hint ?? ""),
  };
};
export async function submitMonthlyBoletaAction(form: FormData) {
  const correlationId = randomUUID().slice(0, 8).toUpperCase();
  let path = "";
  const fail = (stage: string, error: unknown) => {
    console.error(
      JSON.stringify({
        event: "staff_boleta_upload_failed",
        stage,
        correlationId,
        code: error instanceof Error ? error.name : "UPLOAD_ERROR",
      }),
    );
    return {
      ok: false,
      message: `No fue posible subir la boleta. Referencia: ${correlationId}`,
    };
  };
  try {
    console.info(
      JSON.stringify({ event: "staff_boleta_upload_start", correlationId }),
    );
    const session = await loadPortalSession("STAFF");
    if (!session?.staff_id) return fail("auth", new Error("STAFF_SESSION"));
    console.info(
      JSON.stringify({
        event: "staff_boleta_upload_auth_ok",
        correlationId,
        staffId: session.staff_id,
      }),
    );
    const selected = fileFrom(form),
      month = String(form.get("month") ?? "").slice(0, 7),
      id = randomUUID();
    path = monthlyBoletaPath(session.staff_id, month, id, selected.file.name);
    const admin = createAdminClient(),
      bytes = await selected.file.arrayBuffer();
    const upload = await admin.storage
      .from("orbit-documents")
      .upload(path, bytes, { contentType: selected.mime, upsert: false });
    if (upload.error) return fail("storage", upload.error);
    console.info(
      JSON.stringify({
        event: "staff_boleta_upload_storage_ok",
        correlationId,
      }),
    );
    const { data: documentId, error } = await admin.rpc(
      "submit_staff_monthly_boleta",
      {
        p_staff_id: session.staff_id,
        p_month: `${month}-01`,
        p_bucket: "orbit-documents",
        p_path: path,
        p_file_name: selected.file.name,
        p_mime_type: selected.mime,
        p_actor: null,
      },
    );
    if (error) {
      await admin.storage.from("orbit-documents").remove([path]);
      return fail("document", error);
    }
    console.info(
      JSON.stringify({
        event: "staff_boleta_upload_document_ok",
        correlationId,
        documentId,
      }),
    );
    try {
      await syncStaffDocumentArchive(admin, String(documentId));
    } catch (driveError) {
      console.error(
        JSON.stringify({
          event: "staff_boleta_upload_drive_archive_failed",
          correlationId,
          code: driveError instanceof Error ? driveError.name : "DRIVE_ERROR",
        }),
      );
    }
    console.info(
      JSON.stringify({ event: "staff_boleta_upload_complete", correlationId }),
    );
    refresh();
    return { ok: true, message: "✓ Boleta recibida · Pendiente de revisión" };
  } catch (error) {
    if (path)
      await createAdminClient().storage.from("orbit-documents").remove([path]);
    return fail("unknown", error);
  }
}
async function adminContext() {
  const client = await createSupabaseServerActionClient(),
    { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Tu sesión expiró.");
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role))
    throw new Error("Acceso administrativo requerido.");
  return client;
}
export async function reviewMonthlyBoletaAction(form: FormData) {
  const correlationId = randomUUID().slice(0, 8).toUpperCase();
  const action = String(form.get("action") ?? "");
  const accountId = String(form.get("accountId") ?? "");
  const fail = (stage: string, error: unknown) => {
    console.error(
      JSON.stringify({
        event: "staff_boleta_review_failed",
        stage,
        correlationId,
        code: error instanceof Error ? error.name : "REVIEW_ERROR",
      }),
    );
    return {
      ok: false,
      message: `No fue posible revisar la boleta. Referencia: ${correlationId}`,
    };
  };
  try {
    console.info(
      JSON.stringify({
        event: "staff_boleta_review_start",
        correlationId,
        action,
      }),
    );
    const client = await adminContext();
    console.info(
      JSON.stringify({ event: "staff_boleta_review_auth_ok", correlationId }),
    );
    const { data: before, error: beforeError } = await client
      .from("staff_monthly_accounts")
      .select("id,boleta_status,boleta_document_id,review_required")
      .eq("id", accountId)
      .single();
    if (beforeError || !before)
      return fail("account", beforeError ?? new Error("ACCOUNT_NOT_FOUND"));
    console.info(
      JSON.stringify({
        event: "staff_boleta_review_status_before",
        correlationId,
        status: before.boleta_status,
        reviewRequired: before.review_required,
      }),
    );
    if (before.boleta_status !== "RECEIVED")
      return fail("status", new Error("BOLETA_NOT_RECEIVED"));
    console.info(
      JSON.stringify({
        event: "staff_boleta_review_document_ok",
        correlationId,
        documentId: before.boleta_document_id,
      }),
    );
    const { data, error } = await client.rpc("review_staff_monthly_boleta", {
      p_account_id: accountId,
      p_action: action,
      p_reason: String(form.get("reason") ?? ""),
    });
    if (error || !data)
      return fail("status", error ?? new Error("REVIEW_EMPTY"));
    console.info(
      JSON.stringify({
        event: "staff_boleta_review_status_transition_ok",
        correlationId,
        status: data.boleta_status,
      }),
    );
    const { data: after, error: readError } = await client
      .from("staff_monthly_accounts")
      .select("boleta_status,boleta_reviewed_at,payment_status")
      .eq("id", accountId)
      .single();
    if (readError || !after || after.boleta_status === "RECEIVED")
      return fail("readback", readError ?? new Error("REVIEW_NOT_PERSISTED"));
    console.info(
      JSON.stringify({
        event: "staff_boleta_review_alert_resolved",
        correlationId,
      }),
    );
    if (action === "APPROVE" && data.boleta_document_id)
      try {
        await syncStaffDocumentArchive(
          createAdminClient(),
          data.boleta_document_id,
        );
      } catch (driveError) {
        console.error("[ORBIT][STAFF_DRIVE_ARCHIVE]", driveError);
      }
    console.info(
      JSON.stringify({ event: "staff_boleta_review_complete", correlationId }),
    );
    refresh();
    return {
      ok: true,
      message:
        after.boleta_status === "APPROVED"
          ? "✓ Boleta aprobada · Pago listo para pagar"
          : "✓ Boleta rechazada.",
    };
  } catch (error) {
    return fail("unknown", error);
  }
}
export async function generateMonthlyStaffAccountsAction(form: FormData) {
  try {
    const client = await adminContext(),
      month = String(form.get("month") ?? "").slice(0, 7);
    const { data, error } = await client.rpc(
      "generate_staff_monthly_accounts",
      { p_month: `${month}-01` },
    );
    if (error) throw error;
    refresh();
    return {
      ok: true,
      message: `${Number(data ?? 0)} liquidaciones actualizadas desde Eventos del período.`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "No fue posible generar las liquidaciones.",
    };
  }
}
export async function completeSettlementEventAction(
  projectId: string,
  correlationId: string = randomUUID(),
) {
  try {
    const client = await adminContext();
    const { data, error } = await client.rpc(
      "complete_staff_settlement_event_operationally",
      { p_project_id: projectId, p_correlation_id: correlationId },
    );
    if (error || !data) throw error ?? new Error("No se pudo completar el Evento.");
    refresh();
    return {
      ok: true,
      eventId: projectId,
      status: "Completed",
      correlationId,
      message: "✓ Evento marcado como completado",
    };
  } catch (error) {
    const info = errorInfo(error);
    console.error(JSON.stringify({event:"staff_event_completion_failed",stage:"atomic_completion",projectId,correlationId,code:info.code||info.name,message:info.message,details:info.details,hint:info.hint}));
    return {
      ok: false,
      correlationId,
      message: "No fue posible marcar el evento como completado.",
    };
  }
}
export async function registerStaffAdvanceAction(form: FormData) {
  const uploaded: string[] = [];
  const failureCorrelationId = randomUUID();
  let settlementId = "";
  try {
    const client = await adminContext();
    settlementId = String(form.get("settlementId") ?? "");
    const amount = Number(form.get("amount"));
    const date = String(form.get("date") ?? "");
    const methodChoice = String(form.get("method") ?? "");
    const method = methodChoice === "OTRO" ? String(form.get("methodOther") ?? "").trim() : methodChoice;
    const notes = String(form.get("notes") ?? "").trim();
    const receipt = fileFrom({ get: (key: string) => form.get(key === "file" ? "receipt" : key) });
    const boletaValue = form.get("boleta");
    const boleta = boletaValue instanceof File && boletaValue.size ? fileFrom({ get: () => boletaValue }) : null;
    if (!settlementId || !Number.isFinite(amount) || amount <= 0 || !date || !method)
      throw new Error("Completa monto, fecha y método del adelanto.");
    const admin = createAdminClient();
    const { data: settlement, error: settlementError } = await admin
      .from("event_staff_payments")
      .select("id,staff_id,project_id,status,deleted_at")
      .eq("id", settlementId)
      .maybeSingle();
    if (settlementError || !settlement || settlement.status !== "CONFIRMED" || settlement.deleted_at)
      throw settlementError ?? new Error("Liquidación Staff no encontrada.");
    const fileHash = async (file: File) => createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
    const idempotencyKey = createHash("sha256").update([settlementId, amount, date, method, notes, await fileHash(receipt.file), boleta ? await fileHash(boleta.file) : ""].join("|" )).digest("hex");
    const receiptPath = `staff/advances/${settlement.staff_id}/${settlementId}/${idempotencyKey}/${receipt.file.name}`;
    const receiptUpload = await admin.storage.from("orbit-documents").upload(receiptPath, await receipt.file.arrayBuffer(), {contentType:receipt.mime,upsert:true});
    if (receiptUpload.error) throw receiptUpload.error;
    uploaded.push(receiptPath);
    let boletaPath: string | null = null;
    if (boleta) {
      boletaPath = `staff/advances/${settlement.staff_id}/${settlementId}/${idempotencyKey}/boleta-${boleta.file.name}`;
      const boletaUpload = await admin.storage.from("orbit-documents").upload(boletaPath, await boleta.file.arrayBuffer(), {contentType:boleta.mime,upsert:true});
      if (boletaUpload.error) throw boletaUpload.error;
      uploaded.push(boletaPath);
    }
    const { error } = await client.rpc("register_staff_advance_with_documents", {
      p_settlement_id:settlementId,p_amount:amount,p_date:date,p_method:method,p_notes:notes,p_idempotency_key:idempotencyKey,
      p_receipt_bucket:"orbit-documents",p_receipt_path:receiptPath,p_receipt_file_name:receipt.file.name,p_receipt_mime_type:receipt.mime,
      p_boleta_bucket:boletaPath?"orbit-documents":null,p_boleta_path:boletaPath,p_boleta_file_name:boleta?.file.name??null,p_boleta_mime_type:boleta?.mime??null,
    });
    if (error) throw error;
    refresh();
    return { ok: true, message: "✓ Adelanto registrado y liquidación recalculada." };
  } catch (error) {
    if (uploaded.length) await createAdminClient().storage.from("orbit-documents").remove(uploaded);
    const info = errorInfo(error);
    const message = info.message || "No fue posible registrar el adelanto.";
    console.error(JSON.stringify({event:"staff_advance_failed",stage:"payment",settlementId,correlationId:failureCorrelationId,code:info.code||info.name,message:info.message,details:info.details,hint:info.hint}));
    return { ok: false, message: `${message} Referencia ${failureCorrelationId}` };
  }
}
export async function finalizeMonthlyStaffAccountAction(form: FormData) {
  try {
    const client = await adminContext(),
      accountId = String(form.get("accountId") ?? ""),
      { error } = await client.rpc("finalize_staff_monthly_account", {
        p_account_id: accountId,
      });
    if (error) throw error;
    const admin = createAdminClient(),
      { data: row, error: rowError } = await admin
        .from("staff_monthly_accounts")
        .select(STAFF_MONTHLY_ACCOUNT_SELECT)
        .eq("id", accountId)
        .single();
    if (rowError) throw rowError;
    const { data: staff, error: staffError } = await admin
      .from("staff")
      .select("first_name,last_name,rut,role")
      .eq("id", row.staff_id)
      .single();
    if (staffError) throw staffError;
    const account = mapStaffMonthlyAccount(row),
      pdf = await createStaffMonthlySettlementPdf({
        account,
        staff: {
          name: `${staff.first_name} ${staff.last_name}`,
          rut: staff.rut ?? "",
          role: staff.role ?? "",
        },
      }),
      path = monthlySettlementPath(account.staffId, account.month),
      upload = await admin.storage
        .from("orbit-documents")
        .upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (upload.error) throw upload.error;
    let { data: document } = await admin
      .from("staff_onboarding_documents")
      .select("id")
      .eq("staff_id", account.staffId)
      .eq("storage_bucket", "orbit-documents")
      .eq("storage_path", path)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (!document) {
      const inserted = await admin
        .from("staff_onboarding_documents")
        .insert({
          invitation_id: null,
          staff_id: account.staffId,
          document_type: "STAFF_MONTHLY_SETTLEMENT",
          category: "LIQUIDACIONES",
          applicable_month: account.month,
          friendly_label: `Liquidación mensual ${account.month.slice(0, 7)}`,
          status: "ACTIVE",
          storage_bucket: "orbit-documents",
          storage_path: path,
          file_name: `liquidacion-staff-${account.month.slice(0, 7)}.pdf`,
          mime_type: "application/pdf",
        })
        .select("id")
        .single();
      if (inserted.error) throw inserted.error;
      document = inserted.data;
    }
    const link = await admin
      .from("staff_monthly_accounts")
      .update({ settlement_document_id: document.id })
      .eq("id", accountId);
    if (link.error) throw link.error;
    try {
      await syncStaffDocumentArchive(admin, document.id);
    } catch (driveError) {
      console.error("[ORBIT][STAFF_DRIVE_ARCHIVE]", driveError);
    }
    refresh();
    return {
      ok: true,
      message:
        "Liquidación finalizada, PDF protegido y snapshot histórico congelado.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "No fue posible finalizar la liquidación.",
    };
  }
}
export async function approveMonthlySettlementReviewAction(form: FormData) {
  try {
    const client = await adminContext(),
      accountId = String(form.get("accountId") ?? ""),
      reason = String(form.get("reason") ?? "").trim();
    if (reason.length < 3)
      throw new Error("Indica el motivo de la aprobación Founder.");
    const { data: row, error } = await client
      .from("staff_monthly_accounts")
      .select(
        "id,staff_id,accounting_month,review_required,review_reason,calculation",
      )
      .eq("id", accountId)
      .single();
    if (error || !row) throw error ?? new Error("Liquidación no encontrada.");
    if (!row.review_required)
      return {
        ok: true,
        message: "La revisión ya estaba resuelta; no se modificó nada.",
      };
    const calculation = (
      row.calculation && typeof row.calculation === "object"
        ? row.calculation
        : {}
    ) as Record<string, unknown>;
    const details = Array.isArray(calculation.details)
      ? calculation.details
      : [];
    const blocking = Array.isArray(calculation.blockingEvents)
      ? calculation.blockingEvents
      : [];
    const settlementIds = [
      ...new Set(
        [...details, ...blocking]
          .map((item) =>
            item && typeof item === "object"
              ? String((item as Record<string, unknown>).settlementId ?? "")
              : "",
          )
          .filter(Boolean),
      ),
    ];
    if (!settlementIds.length)
      throw new Error(
        `No se puede aprobar automáticamente: ${String(row.review_reason ?? "Requiere revisión de cálculo")}.`,
      );
    for (const settlementId of settlementIds) {
      const { error: overrideError } = await client.rpc(
        "override_staff_monthly_close_eligibility",
        { p_settlement_id: settlementId, p_reason: reason },
      );
      if (overrideError) throw overrideError;
    }
    const { data: refreshed, error: refreshError } = await client.rpc(
      "ensure_staff_monthly_account",
      { p_staff_id: row.staff_id, p_month: row.accounting_month },
    );
    if (refreshError) throw refreshError;
    if (refreshed?.review_required)
      throw new Error(
        "La liquidación mantiene bloqueos adicionales y no quedó lista para pago.",
      );
    refresh();
    return {
      ok: true,
      message:
        "✓ Revisión Founder aprobada · Liquidación lista para continuar.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "No fue posible aprobar la revisión Founder.",
    };
  }
}
export async function registerMonthlyStaffPaymentAction(form: FormData) {
  let path = "";
  const correlationId = randomUUID().slice(0, 8).toUpperCase();
  const fail = (stage: string, error: unknown) => {
    const info = errorInfo(error);
    console.error(
      JSON.stringify({
        event: "staff_payment_registration_failed",
        stage,
        correlationId,
        code: info.code || info.name,
        message: info.message,
        details: info.details,
        hint: info.hint,
      }),
    );
    const message =
      stage === "storage"
        ? "No se pudo subir el comprobante."
        : stage === "payment"
          ? /requiere revisión Founder/i.test(info.message)
            ? "Esta liquidación requiere revisión Founder antes de registrar el pago."
            : "No se pudo registrar el pago en el libro Staff."
          : stage === "validation"
            ? info.message
            : "No fue posible registrar el pago.";
    return { ok: false, message: `${message} Referencia: ${correlationId}` };
  };
  try {
    const client = await adminContext(),
      selected = fileFrom(form),
      file = selected.file,
      staffId = String(form.get("staffId") ?? ""),
      month = String(form.get("month") ?? "").slice(0, 7),
      accountId = String(form.get("accountId") ?? ""),
      amount = Number(form.get("amount")),
      paymentDate = String(form.get("paymentDate") ?? ""),
      methodChoice = String(form.get("method") ?? ""),
      method = methodChoice === "OTRO"
        ? String(form.get("methodOther") ?? "").trim()
        : methodChoice,
      reference = String(form.get("reference") ?? ""),
      bytes = await file.arrayBuffer(),
      fileHash = createHash("sha256").update(Buffer.from(bytes)).digest("hex"),
      key = createHash("sha256")
        .update(
          [
            accountId,
            String(form.get("amount")),
            paymentDate,
            method,
            reference,
            fileHash,
          ].join("|"),
        )
        .digest("hex"),
      admin = createAdminClient();
    if (
      !accountId ||
      !staffId ||
      !month ||
      !paymentDate ||
      !method ||
      !Number.isFinite(amount) ||
      amount <= 0
    )
      return fail(
        "validation",
        new Error("Completa los datos requeridos del pago."),
      );
    const { data: current, error: currentError } = await client
      .from("staff_monthly_accounts")
      .select("payment_status,payment_idempotency_key")
      .eq("id", accountId)
      .maybeSingle();
    if (currentError) return fail("validation", currentError);
    if (current?.payment_status === "PAID")
      return {
        ok: true,
        message: "Este pago ya estaba registrado; no se creó un duplicado.",
      };
    path = monthlyReceiptPath(staffId, month, key, file.name);
    const upload = await admin.storage
      .from("orbit-documents")
      .upload(path, bytes, { contentType: selected.mime, upsert: true });
    if (upload.error) return fail("storage", upload.error);
    const { data, error } = await client.rpc("register_staff_monthly_payment", {
      p_account_id: accountId,
      p_payment_date: paymentDate,
      p_amount: amount,
      p_method: method,
      p_reference: reference,
      p_idempotency_key: key,
      p_bucket: "orbit-documents",
      p_path: path,
      p_file_name: file.name,
      p_mime_type: selected.mime,
    });
    if (error) {
      await admin.storage.from("orbit-documents").remove([path]);
      return fail("payment", error);
    }
    if (data?.payment_receipt_document_id)
      try {
        await syncStaffDocumentArchive(admin, data.payment_receipt_document_id);
      } catch (driveError) {
        console.error(
          JSON.stringify({
            event: "staff_payment_drive_archive_failed",
            correlationId,
            code: errorInfo(driveError).code || errorInfo(driveError).name,
            message: errorInfo(driveError).message,
          }),
        );
      }
    refresh();
    return {
      ok: true,
      message: "Pago final registrado una sola vez con comprobante.",
    };
  } catch (error) {
    if (path)
      await createAdminClient().storage.from("orbit-documents").remove([path]);
    return fail("unknown", error);
  }
}
