import{AccountsReceivableCenter,loadAccountsReceivable}from"@/features/accounts-receivable";import{createSupabaseServerClient}from"@/lib/supabase/server";
export default async function AccountsReceivablePage(){const client=await createSupabaseServerClient();return <AccountsReceivableCenter dataset={await loadAccountsReceivable(client)}/>}
