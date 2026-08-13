import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function loadStaffOnboarding(token: string) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("staff_onboarding_invitations")
    .select(
      "id,first_name,last_name,email,mobile,status,expires_at,review_notes,submitted_data",
    )
    .eq("token_hash", tokenHash(token))
    .gt("expires_at", now)
    .in("status", ["INVITED", "OPENED", "CHANGES_REQUESTED", "SUBMITTED"])
    .maybeSingle();
  if (error || !data) return null;
  if (data.status === "INVITED")
    await admin
      .from("staff_onboarding_invitations")
      .update({ status: "OPENED", updated_at: now })
      .eq("id", data.id)
      .eq("status", "INVITED");
  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    mobile: data.mobile,
    status: data.status === "INVITED" ? "OPENED" : data.status,
    reviewNotes: data.review_notes,
    data: (data.submitted_data ?? {}) as Record<string, unknown>,
  };
}
export const staffOnboardingTokenHash = tokenHash;
