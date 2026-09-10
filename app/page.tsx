import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { BrandSignature } from "@/components/brand-signature";
import { UnifiedAccess, type AccessType } from "@/features/authentication/components/unified-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OrbitHomePage({ searchParams }: { searchParams: Promise<{ error?: string; access?: string }> }) {
  const { error, access } = await searchParams;
  const client = await createSupabaseServerClient();
  const { data } = await client.auth.getUser();
  if (data.user) {
    const { data: profile } = await client.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    if (profile && ["CEO", "ADMINISTRATOR"].includes(profile.role)) redirect("/operations");
  }
  const initialAccess: AccessType = access === "customer" ? "CUSTOMER" : access === "staff" ? "STAFF" : "ADMIN";
  const message = error === "session-expired" ? "Tu sesión expiró. Vuelve a iniciar sesión." : error === "access-denied" ? "Este acceso no tiene permisos administrativos." : undefined;

  return <main className="dark flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-background p-3 text-foreground sm:p-4">
    <section className="w-full max-w-2xl rounded-[2rem] border bg-card p-4 shadow-xl shadow-black/20 sm:p-6">
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-accent hover:text-foreground" href="https://www.boom-box.cl">
        <ArrowLeft className="size-4" />Volver a BOOMBOX
      </Link>
      <div className="mb-4 text-center">
        <div className="mx-auto flex h-20 items-center justify-center rounded-xl px-3 sm:h-24"><BrandLogo className="w-full max-w-[16rem] sm:max-w-[18rem]" priority surface="dark" /></div>
      </div>
      <UnifiedAccess initialAccess={initialAccess} initialMessage={message} />
      <BrandSignature className="mt-5 border-t pt-4 text-center" />
    </section>
  </main>;
}
