import { redirect } from "next/navigation";
import { BlackBoxMaster } from "@/features/resources/black-box-master";
import { loadBoxes } from "@/features/resources/box-inventory";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function BoxesPage() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const boxes = await loadBoxes(client);
  return <main>{/* Cajas Negras · Master Admin */}<BlackBoxMaster initialBoxes={boxes} /></main>;
}
