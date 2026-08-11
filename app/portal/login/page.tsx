import { PortalLoginForm } from "@/features/portal-authentication";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadModuleStates } from "@/features/module-manager/repository";
export default async function CustomerPortalLoginPage(){const modules=await loadModuleStates(createAdminClient());if(!modules.CUSTOMER_PORTAL)notFound();return <PortalLoginForm type="CUSTOMER"/>}
