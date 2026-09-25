import { PhoneReviewCenter } from "@/features/crm/phone-review-center";
import { loadPhoneReviewData } from "@/features/crm/phone-review-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { unauthorizedLandingForRole } from "@/lib/auth/roles";

export default async function PhoneReviewPage() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  const { data: profile } = auth.user
    ? await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle()
    : { data: null };
  if (!auth.user || !profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) {
    redirect(unauthorizedLandingForRole(profile?.role));
  }
  return <PhoneReviewCenter initialData={await loadPhoneReviewData(client)} />;
}
