"use server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCustomerPortalAccess } from "./customer-portal.service";
export async function createCustomerPortalAccessAction(projectId:string){try{const client=await createSupabaseServerClient();const {data,error}=await client.auth.getUser();if(error||!data.user)throw error??new Error("Sesión requerida.");return {ok:true as const,...await createCustomerPortalAccess(projectId,data.user.id)};}catch(error){return {ok:false as const,error:error instanceof Error?error.message:"No fue posible crear el portal."};}}
