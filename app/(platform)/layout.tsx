import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { loadFounderActionCount } from "@/features/founder-action-center";
import { createSupabaseServerClient, getSupabaseRenderUser } from "@/lib/supabase/server";
import { isInvalidSessionError, isMissingSessionError, isTransientSupabaseTransportError } from "@/lib/supabase/auth-errors";
import { loadModuleStatesCached } from "@/features/module-manager/repository";
import { loadFounderWorkspaceCached } from "@/features/founder-workspace/repository";
import { LegacyModalScrollGuard } from "@/components/ui/legacy-modal-scroll-guard";
import { isMetaReviewerRole } from "@/lib/auth/roles";
import { defaultModuleStates } from "@/features/module-manager/catalog";
import { DEFAULT_WORKSPACE } from "@/features/founder-workspace/catalog";

export const dynamic = "force-dynamic";

function bounded<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), 4_000)),
  ]);
}

function AccessRecoveryState() {
  return <main className="min-h-screen bg-black px-6 py-24 text-white"><div className="mx-auto max-w-xl border border-white/15 bg-white/[0.03] p-8"><p className="text-xs uppercase tracking-[0.28em] text-white/60">ORBIT · acceso seguro</p><h1 className="mt-4 text-2xl font-semibold">Conexión temporalmente no disponible</h1><p className="mt-3 text-sm leading-6 text-white/70">Tu sesión y permisos se mantienen intactos. Supabase no respondió a tiempo; vuelve a intentar en unos segundos.</p><a className="mt-6 inline-flex min-h-11 items-center border border-white/25 px-5 text-sm" href={typeof window === "undefined" ? "/" : window.location.href}>Reintentar</a></div></main>;
}

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const{data,error}=await getSupabaseRenderUser();
  if(error){if(isMissingSessionError(error))redirect("/login");if(isInvalidSessionError(error))redirect("/api/auth/session-expired");if(isTransientSupabaseTransportError(error))return <AccessRecoveryState/>;throw error}
  const user=data.user;if(!user?.email)redirect("/login");
  const client=await createSupabaseServerClient();
  const{data:profile,error:profileError}=await client.from("profiles").select("role,display_name").eq("id",user.id).maybeSingle();if(profileError){if(isTransientSupabaseTransportError(profileError))return <AccessRecoveryState/>;throw profileError}if(!profile||(!["CEO","ADMINISTRATOR"].includes(profile.role)&&!isMetaReviewerRole(profile.role)))redirect(profile?.role==="STAFF"?"/login?access=staff":"/login?access=customer");
  if(isMetaReviewerRole(profile.role))return <>{children}</>;
  // Module definitions are provisioned by the module-management workflow;
  // avoid an upsert on every route navigation in the global shell.
  const [founderActionCount,modules,workspace]=await Promise.all([
    bounded(loadFounderActionCount(user.id), 0),
    bounded(loadModuleStatesCached(), { ...defaultModuleStates }),
    bounded(loadFounderWorkspaceCached(user.id), structuredClone(DEFAULT_WORKSPACE)),
  ]);
  const resilientSyncEnabled = Boolean(process.env.RESILIENT_SYNC_ENABLED) && process.env.RESILIENT_SYNC_ENABLED !== "false";
  return <AppShell actionableNotifications={founderActionCount} modules={modules} resilientSyncEnabled={resilientSyncEnabled} userEmail={user.email} userId={user.id} userName={profile.display_name||"Founder"} userRole={profile.role==="CEO"?"Founder":"Administrador"} workspace={workspace}><LegacyModalScrollGuard/>{children}</AppShell>;
}
