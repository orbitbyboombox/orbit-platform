import { redirect } from "next/navigation";
import { UnifiedAccess } from "@/features/authentication/components/unified-access";
import { BrandLogo } from "@/components/brand-logo";
import { BrandSignature } from "@/components/brand-signature";
import { loadCompanySettings } from "@/features/company-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{ error?: string;next?:string;access?:string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error,access } = await searchParams;
  const settings=await loadCompanySettings(await createSupabaseServerClient());
  if (process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) {
    const client=await createSupabaseServerClient();const{data}=await client.auth.getUser();const user=data.user;
    if(user){const{data:profile}=await client.from("profiles").select("role").eq("id",user.id).maybeSingle();if(profile&&["CEO","ADMINISTRATOR"].includes(profile.role))redirect("/operations")}
  }
  const message=error==="session-expired"?"Tu sesión expiró. Vuelve a iniciar sesión.":error==="access-denied"?"Este acceso no tiene permisos administrativos.":undefined;
  const initialAccess=access==="customer"?"CUSTOMER":access==="staff"?"STAFF":"ADMIN";
  return <main className="dark flex min-h-screen items-center justify-center bg-background p-4 text-foreground sm:p-6"><section className="w-full max-w-2xl rounded-[2rem] border bg-card p-5 shadow-xl shadow-black/20 sm:p-8"><div className="mb-8 text-center"><div className="mx-auto flex h-28 items-center justify-center rounded-xl px-3 sm:h-32"><BrandLogo className="w-full max-w-[18rem] sm:max-w-[20rem]" priority surface="dark" /></div><h1 className="mt-4 text-2xl font-semibold tracking-[-0.025em]">Bienvenido a {settings.productName}</h1><p className="mt-2 text-sm leading-6 text-muted">Selecciona el acceso que corresponde a tu experiencia.</p></div><UnifiedAccess initialAccess={initialAccess} initialMessage={message}/><BrandSignature className="mt-8 border-t pt-5 text-center" /></section></main>;
}
