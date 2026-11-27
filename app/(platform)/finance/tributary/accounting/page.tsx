import Link from "next/link";
import { notFound } from "next/navigation";
import { SiiRcvPreview } from "@/features/finance/components/sii-rcv-preview";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AccountingPage() {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) notFound();
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) notFound();

  return (
    <main className="mx-auto max-w-6xl space-y-5">
      <Link href="/finance/tributary" className="text-sm font-semibold text-brand">Volver al Centro tributario</Link>
      <h1 className="text-3xl font-semibold">Contabilidad Premium</h1>
      <SiiRcvPreview />
    </main>
  );
}
