import {createSupabaseServerClient} from "@/lib/supabase/server";
import {AccountantExportCenter} from "@/features/accountant-export/accountant-export-center";
import {DEFAULT_ACCOUNTANT_EXPORT_CONFIG,type AccountantExportConfig} from "@/features/accountant-export/types";

export default async function AccountantExportPage(){const client=await createSupabaseServerClient();const{data}=await client.from("company_settings").select("pdf_configuration").eq("settings_key","PRIMARY").maybeSingle();const stored=data?.pdf_configuration&&typeof data.pdf_configuration==="object"?(data.pdf_configuration as Record<string,unknown>).accountantExport:null;const config={...DEFAULT_ACCOUNTANT_EXPORT_CONFIG,...(stored&&typeof stored==="object"?stored:{})} as AccountantExportConfig;return <AccountantExportCenter initialConfig={config}/>}
