import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
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

  return <main className="dark bbox-access-shell">
    <section className="bbox-access-card">
      <div className="bbox-brand-panel">
        <div className="bbox-brand-top"><span className="bbox-brand-dot" /> <span>ORBIT NOVA</span></div>
        <div className="bbox-brand-main"><BrandLogo className="bbox-brand-logo" priority surface="dark" /><span className="bbox-brand-overline">PLATAFORMA PRIVADA DE OPERACIÓN</span><h1>Gestión inteligente<br />para <em>tu operación.</em></h1><p>Una experiencia integrada para gestionar cada evento BOOMBOX.</p></div>
        <div className="bbox-brand-bottom"><span>♢ &nbsp;Acceso seguro</span><span>✦ &nbsp;Operación centralizada · tiempo real</span></div>
      </div>
      <div className="bbox-form-panel">
        <div className="bbox-form-top"><span>ORBIT / BOOMBOX</span><span className="bbox-status"><i /> Sistema operativo</span></div>
        <UnifiedAccess initialAccess={initialAccess} initialMessage={message} />
        <div className="bbox-access-footer"><span>ORBIT BOOMBOX</span><span>Powered by ORBIT NOVA</span></div>
      </div>
    </section>
  </main>;
}
