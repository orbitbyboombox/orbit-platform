import { notFound } from "next/navigation";
import { CustomerPortalHome } from "@/features/customer-portal/customer-portal-home";
import { loadCustomerPortal } from "@/features/customer-portal/customer-portal.service";
export const dynamic="force-dynamic";
export default async function CustomerPortalPage({params}:{params:Promise<{token:string}>}){const {token}=await params;const data=await loadCustomerPortal(token);if(!data)notFound();return <CustomerPortalHome data={data} token={token}/>;}
