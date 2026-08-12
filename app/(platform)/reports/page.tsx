import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BusinessIntelligenceCenter, type BusinessIntelligenceDataset } from "@/features/business-intelligence";
import { loadFinancialTruth } from "@/features/business-engine";
import { PersonalWorkspaceSections } from "@/features/founder-workspace";

export default async function ReportsPage(){
  const client=await createSupabaseServerClient(); const {data:auth,error:authError}=await client.auth.getUser(); if(authError||!auth.user)redirect("/login");
  const financialTruth=await loadFinancialTruth(client);
  const [customers,projects,services,quotations,quotationItems,profits,assignments,payroll,staff,assets,assetAssignments,assetHistory,reviews,reviewStaff,profiles,receivables]=await Promise.all([
    client.from("customers").select("id,full_name,city,metadata,created_at").is("deleted_at",null),
    client.from("projects").select("id,customer_id,name,project_type,status,event_date,city,location,created_at").is("deleted_at",null),
    client.from("project_services").select("project_id,service_code,duration_hours"),
    client.from("quotations").select("id,project_id,customer_id,status,official_price,final_customer_price,grand_total,discount_total,pricing_snapshot,approved_by,created_by,created_at,approved_at").is("deleted_at",null),
    client.from("quotation_items").select("quotation_id,item_type,code,label,total"),
    client.from("profit_snapshots").select("id,project_id,revenue,operational_cost,gross_margin,gross_margin_percent,created_at").is("deleted_at",null).order("created_at",{ascending:false}),
    client.from("assignments").select("id,project_id,staff_id,assignment_type,status,created_at").is("deleted_at",null),
    client.from("event_staff_payments").select("project_id,staff_id,total_internal_payment,status").is("deleted_at",null),
    client.from("staff").select("id,first_name,last_name,status").is("deleted_at",null),
    client.from("operational_assets").select("id,asset_code,asset_type,status,usage_counter").is("deleted_at",null),
    client.from("asset_assignments").select("asset_id,project_id,assignment_status").is("deleted_at",null),
    client.from("asset_history").select("asset_id,project_id,history_type,occurred_at"),
    client.from("experience_reviews").select("id,project_id,customer_id,venue_name,venue_city,general_rating,customer_experience,operational_experience,lessons_avoid,recommendations,created_at"),
    client.from("experience_review_staff").select("review_id,staff_id,assignment_type"),
    client.from("profiles").select("id,display_name"),
    client.from("accounts_receivable_projection").select("id,project_id,customer_id,amount,outstanding_balance,effective_status,days_remaining,aging_bucket").neq("effective_status","CANCELLED"),
  ]);
  const firstError=[customers,projects,services,quotations,quotationItems,profits,assignments,payroll,staff,assets,assetAssignments,assetHistory,reviews,reviewStaff,profiles,receivables].find(result=>result.error)?.error; if(firstError)throw firstError;
  const certificationCustomers=new Set((customers.data??[]).filter(item=>{const metadata=item.metadata as Record<string,unknown>;return metadata.record_type==="SYSTEM_CERTIFICATION"||metadata.recordType==="QA_OPERATIONAL_CERTIFICATION"||typeof metadata.validation==="string"}).map(item=>item.id));
  const productionProjects=(projects.data??[]).filter(item=>!certificationCustomers.has(item.customer_id)); const projectIds=new Set(productionProjects.map(item=>item.id)); const customerIds=new Set(productionProjects.map(item=>item.customer_id));
  const dataset:BusinessIntelligenceDataset={
    generatedAt:new Date().toISOString(),financialEvents:financialTruth.filter(item=>projectIds.has(item.projectId)).map(item=>({project_id:item.projectId,customer_id:item.customerId,status:item.status,event_date:item.eventDate,revenue:item.revenue,real_cost:item.realCost,personnel_cost:item.personnelCost,operational_resources_cost:item.operationalResourcesCost,total_operational_cost:item.totalOperationalCost,gross_profit:item.grossProfit,gross_margin:item.grossMargin,outstanding_balance:item.outstandingBalance})),customers:(customers.data??[]).filter(item=>customerIds.has(item.id)),projects:productionProjects,
    services:(services.data??[]).filter(item=>projectIds.has(item.project_id)),quotations:(quotations.data??[]).filter(item=>projectIds.has(item.project_id)),
    quotationItems:quotationItems.data??[],profits:(profits.data??[]).filter(item=>projectIds.has(item.project_id)),assignments:(assignments.data??[]).filter(item=>projectIds.has(item.project_id)),
    payroll:(payroll.data??[]).filter(item=>projectIds.has(item.project_id)),staff:staff.data??[],assets:assets.data??[],assetAssignments:(assetAssignments.data??[]).filter(item=>projectIds.has(item.project_id)),assetHistory:(assetHistory.data??[]).filter(item=>!item.project_id||projectIds.has(item.project_id)),
    reviews:(reviews.data??[]).filter(item=>projectIds.has(item.project_id)),reviewStaff:reviewStaff.data??[],profiles:profiles.data??[],
    receivables:(receivables.data??[]).filter(item=>projectIds.has(item.project_id)),
  };
  return <PersonalWorkspaceSections moduleKey="REPORTS" sections={[{key:"BUSINESS_INTELLIGENCE",label:"Business Intelligence",content:<BusinessIntelligenceCenter dataset={dataset}/>} ]}/>;
}
