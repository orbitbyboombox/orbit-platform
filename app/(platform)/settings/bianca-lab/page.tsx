import { redirect } from "next/navigation";
import { BiancaLab } from "@/features/bianca-lab/bianca-lab";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BiancaLabPage() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) redirect("/operations");
  return <BiancaLab />;
}
