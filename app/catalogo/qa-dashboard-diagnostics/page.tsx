import { notFound } from "next/navigation";
import { isReadOnlyVisualPreview } from "@/lib/supabase/environment-guard";
import { DiagnosticQaFixture } from "@/features/founder-action-center/diagnostic-qa-fixture";
export const dynamic = "force-dynamic";
export default async function DiagnosticQaPage({ searchParams }: { searchParams: Promise<{ viewport?: string }> }) {
  if (!isReadOnlyVisualPreview()) notFound();
  const params = await searchParams;
  if (params.viewport === "iphone") return <main className="p-4"><h1 className="mb-3 text-lg font-semibold">QA responsive · 390 × 844</h1><iframe title="Vista iPhone de prueba" src="/catalogo/qa-dashboard-diagnostics" style={{ width: 390, height: 844, maxWidth: "100%", border: "1px solid #555" }} /></main>;
  return <DiagnosticQaFixture />;
}
