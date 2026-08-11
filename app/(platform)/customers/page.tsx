import{CustomerCenter,loadCrmCustomers}from"@/features/crm";import{createSupabaseServerClient}from"@/lib/supabase/server";
export default async function CustomersPage(){const client=await createSupabaseServerClient();return<CustomerCenter customers={await loadCrmCustomers(client)}/>}
