import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
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

  return <main className="access-redesign-shell"><section className="access-redesign-card">
    <div className="access-brand-panel">
      <Link className="brand-panel-top" href="https://www.boom-box.cl"><span className="brand-orbit-dot" /><span>ORBIT NOVA</span></Link>
      <div className="brand-panel-main">
        <div className="brand-panel-logo"><BrandLogo priority surface="dark" /></div>
        <span className="brand-overline">PLATAFORMA PRIVADA DE OPERACIÓN</span>
        <h2>Gestión inteligente<br />para <em>tu operación.</em></h2>
        <p>Una experiencia integrada para gestionar cada evento BOOMBOX.</p>
      </div>
      <div className="brand-panel-bottom"><span><ShieldCheck size={15} /> Acceso seguro</span><span><Sparkles size={15} /> Operación centralizada · tiempo real</span></div>
    </div>
    <div className="access-form-panel">
      <div className="access-form-top"><span>ORBIT / BOOMBOX</span><span className="access-status"><i /> Sistema operativo</span></div>
      <UnifiedAccess initialAccess={initialAccess} initialMessage={message} />
      <div className="access-footer"><span>ORBIT BOOMBOX v1.9</span><span>Powered by ORBIT NOVA</span></div>
    </div>
  </section></main>;
}
