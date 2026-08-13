import{AccountsPayableCenter,loadAccountsPayable}from"@/features/accounts-payable";
import{createSupabaseServerClient}from"@/lib/supabase/server";
export default async function AccountsPayablePage(){const client=await createSupabaseServerClient();return <AccountsPayableCenter dataset={await loadAccountsPayable(client)}/>}
