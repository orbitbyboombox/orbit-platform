import Link from "next/link";
import { notFound } from "next/navigation";
import { SiiRcvPreview } from "@/features/finance/components/sii-rcv-preview";
import type { parseSiiRcv } from "@/features/finance/sii-rcv";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AccountingPage() {
  const client = await createSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) notFound();
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) notFound();

  type Document = ReturnType<typeof parseSiiRcv>["documents"][number];
  const { data, error } = await createAdminClient().from("sii_rcv_documents" as never)
    .select("id,snapshot").eq("company_rut", "765652723").order("id").limit(1000);
  const rows = (data ?? []) as { snapshot: Document }[];
  const saved = {
    Compras: rows.map(row => row.snapshot).filter(doc => doc.key.startsWith("Compras|")),
    Ventas: rows.map(row => row.snapshot).filter(doc => doc.key.startsWith("Ventas|")),
  };
  return (
    <main className="mx-auto max-w-6xl space-y-5">
      <Link href="/finance/tributary" className="text-sm font-semibold text-brand">Volver al Centro tributario</Link>
      <h1 className="text-3xl font-semibold">Contabilidad Premium</h1>
      {error ? <p role="alert">El registro guardado no se pudo cargar.</p> : <SiiRcvPreview saved={saved} />}
    </main>
  );
}
