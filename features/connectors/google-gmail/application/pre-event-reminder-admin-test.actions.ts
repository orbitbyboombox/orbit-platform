"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { loadGoogleWorkspaceAccessToken, loadGoogleWorkspaceConnection } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { GoogleGmailApiProvider, GoogleGmailDeliveryOutcomeUnknownError } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { D10_ADMIN_TEST_COMMUNICATION_TYPE, D10_ADMIN_TEST_RECIPIENT, D10_ADMIN_TEST_SUBJECT, sendAdminD10TestMessage } from "./d10-admin-test-email";
import { isReadOnlyVisualPreview } from "@/lib/supabase/environment-guard";

type TestResult = {
  ok: boolean;
  status: "SENT" | "PENDING" | "FAILED" | "NOT_SENT";
  recipient: string;
  sentAt: string | null;
  deduplicated?: boolean;
  message?: string;
};

const chileDate = (reference: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Santiago",
  }).formatToParts(reference);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const resultForExisting = (row: { status: string; sent_at: string | null }) => ({
  ok: row.status === "SENT",
  status: row.status === "SENT" || row.status === "PENDING" || row.status === "FAILED" ? row.status : "NOT_SENT",
  recipient: D10_ADMIN_TEST_RECIPIENT,
  sentAt: row.sent_at,
  deduplicated: true,
  message: row.status === "SENT" ? "La prueba ya fue enviada hoy; no se generó un duplicado." : "Ya existe un intento de prueba hoy. No se reenvió automáticamente.",
} satisfies TestResult);

export async function sendAdminD10EmailTestAction(): Promise<TestResult> {
  let communicationId: string | null = null;
  const admin = createAdminClient();
  try {
    if (isReadOnlyVisualPreview()) throw new Error("La Preview está en modo solo lectura.");
    const client = await createSupabaseServerActionClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) throw new Error("Inicia sesión para enviar la prueba.");
    const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profileError) throw profileError;
    if (!isAdministrativeRole(profile?.role)) throw new Error("Solo Founder o Administración puede enviar esta prueba.");

    const workspace = await loadGoogleWorkspaceConnection();
    if (workspace.connectionStatus !== "CONNECTED" || !workspace.grantedServices.some((item) => item.id === "GMAIL" && item.granted)) {
      throw new Error("Gmail Workspace de ORBIT no está conectado o no tiene permiso de envío.");
    }

    const reference = new Date();
    const date = chileDate(reference);
    const requestKey = `pre-event-admin-test:${auth.user.id}:${date}`;
    const { data: existing, error: existingError } = await admin
      .from("communications")
      .select("id,status,sent_at")
      .eq("communication_type", D10_ADMIN_TEST_COMMUNICATION_TYPE)
      .eq("request_key", requestKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return resultForExisting(existing);

    const message = (await import("./d10-admin-test-email")).buildAdminD10TestMessage(requestKey, reference);
    const { data: created, error: insertError } = await admin.from("communications").insert({
      customer_id: null,
      project_id: null,
      channel: "GMAIL",
      direction: "OUTBOUND",
      communication_type: D10_ADMIN_TEST_COMMUNICATION_TYPE,
      request_key: requestKey,
      thread_key: requestKey,
      subject: D10_ADMIN_TEST_SUBJECT,
      body: message.body,
      status: "PENDING",
      to_recipient: D10_ADMIN_TEST_RECIPIENT,
      cc_recipients: [],
      occurred_at: reference.toISOString(),
      sent_at: null,
      external_message_id: null,
      failure_reason: null,
      context_snapshot: { administrativeTest: true, synthetic: true, eventDate: message.eventDate, recipient: D10_ADMIN_TEST_RECIPIENT, actorId: auth.user.id },
    }).select("id").single();
    if (insertError) {
      if (insertError.code === "23505") {
        const { data: duplicate } = await admin.from("communications").select("status,sent_at").eq("communication_type", D10_ADMIN_TEST_COMMUNICATION_TYPE).eq("request_key", requestKey).maybeSingle();
        if (duplicate) return resultForExisting(duplicate);
      }
      throw insertError;
    }
    communicationId = created.id;

    try {
      const sender = new GoogleGmailApiProvider(await loadGoogleWorkspaceAccessToken());
      const delivery = await sendAdminD10TestMessage(sender, requestKey, reference);
      const sentAt = new Date().toISOString();
      const { error: updateError } = await admin.from("communications").update({
        status: "SENT",
        sent_at: sentAt,
        occurred_at: sentAt,
        external_message_id: delivery.providerMessageId,
        failure_reason: null,
      }).eq("id", created.id);
      if (updateError) {
        console.error(JSON.stringify({ event: "d10_admin_test.confirmed_but_history_pending", communicationId: created.id, errorCode: updateError.code ?? "DB_UPDATE_FAILED" }));
        return { ok: false, status: "PENDING", recipient: D10_ADMIN_TEST_RECIPIENT, sentAt: null, message: "Gmail confirmó el envío, pero ORBIT no pudo confirmar el historial. No vuelvas a enviar hoy." };
      }
      return { ok: true, status: "SENT", recipient: D10_ADMIN_TEST_RECIPIENT, sentAt, message: "Gmail Workspace confirmó el envío de la prueba." };
    } catch (sendError) {
      const uncertain = sendError instanceof GoogleGmailDeliveryOutcomeUnknownError;
      const status = uncertain ? "PENDING" : "FAILED";
      const failureReason = uncertain ? "Gmail no confirmó el resultado; reintento bloqueado." : "Gmail no pudo completar el envío de la prueba.";
      await admin.from("communications").update({ status, failure_reason: failureReason, occurred_at: new Date().toISOString() }).eq("id", created.id);
      return { ok: false, status, recipient: D10_ADMIN_TEST_RECIPIENT, sentAt: null, message: failureReason };
    }
  } catch (error) {
    return { ok: false, status: "NOT_SENT", recipient: D10_ADMIN_TEST_RECIPIENT, sentAt: null, message: error instanceof Error ? error.message : "No fue posible preparar la prueba." };
  }
}
