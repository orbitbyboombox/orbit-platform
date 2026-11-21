import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuoteError, type QuoteStore } from "./intake";

export function createWebQuoteStore(): QuoteStore {
  // Construct lazily so unconfigured/unauthorized requests never touch the DB.
  return {
    async persist(quote, isTest) {
      const { data, error } = await createAdminClient().rpc("accept_boombox_web_quote", { p_payload: quote, p_is_test: isTest });
      if (error?.code === "23505") throw new QuoteError("REQUEST_ID_CONFLICT", 409);
      if (error || !data?.solicitudId) throw new Error("PERSIST_FAILED");
      return data;
    },
    async claim(id) {
      const { data, error } = await createAdminClient().from("web_quote_leads")
        .update({ notification_status: "SENDING", notification_attempted_at: new Date().toISOString() })
        .eq("solicitud_id", id).eq("notification_status", "PENDING").select("solicitud_id");
      if (error) throw new Error("CLAIM_FAILED");
      return Boolean(data?.length);
    },
    async complete(id, state, providerId, errorCode) {
      const { error } = await createAdminClient().from("web_quote_leads").update({
        notification_status: state, notification_provider_id: providerId ?? null,
        notification_error_code: errorCode ?? null, notification_updated_at: new Date().toISOString(),
      }).eq("solicitud_id", id).eq("notification_status", "SENDING");
      if (error) throw new Error("NOTIFICATION_STATUS_FAILED");
    },
  };
}
