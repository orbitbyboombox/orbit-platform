import { BankingCenter } from "@/features/finance/banking/banking-center";
import { loadBankingReadModel } from "@/features/finance/banking/repository";
import { BankSettings } from "@/features/finance/banking/bank-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export default async function BankingPage(){const client=await createSupabaseServerClient();const data=await loadBankingReadModel(client);return <div className="space-y-7"><BankingCenter data={data}/><BankSettings accounts={data.accounts} rules={data.recurringRules}/></div>;}
