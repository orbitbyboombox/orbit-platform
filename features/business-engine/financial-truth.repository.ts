import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FinancialTruthRecord {
  projectId:string;customerId:string;quotationId:string|null;invoiceId:string|null;orbitEventId:string;eventDate:string|null;status:"PENDING"|"CONFIRMED"|"CANCELLED";
  revenue:number;estimatedCost:number;realCost:number;personnelCost:number;operationalResourcesCost:number;totalOperationalCost:number;grossProfit:number;grossMargin:number;netProfit:number;netMargin:number;invoicedAmount:number;paidAmount:number;outstandingBalance:number;
  costBreakdown:Record<string,number>;traceability:Record<string,unknown>;calculatedAt:string;
}

const number=(value:unknown)=>Number(value??0);
export async function loadFinancialTruth(client:SupabaseClient):Promise<FinancialTruthRecord[]>{
  const{data,error}=await client.from("financial_event_records").select("project_id,customer_id,quotation_id,invoice_id,orbit_event_id,event_date,status,revenue,estimated_cost,real_cost,personnel_cost,operational_resources_cost,total_operational_cost,gross_profit,gross_margin,net_profit,net_margin,invoiced_amount,paid_amount,outstanding_balance,cost_breakdown,traceability,calculated_at").order("event_date",{ascending:false,nullsFirst:false});
  if(error){if(error.code==="42P01")return[];throw error;}
  return(data??[]).map(row=>({projectId:row.project_id,customerId:row.customer_id,quotationId:row.quotation_id,invoiceId:row.invoice_id,orbitEventId:row.orbit_event_id,eventDate:row.event_date,status:row.status,revenue:number(row.revenue),estimatedCost:number(row.estimated_cost),realCost:number(row.real_cost),personnelCost:number(row.personnel_cost),operationalResourcesCost:number(row.operational_resources_cost),totalOperationalCost:number(row.total_operational_cost),grossProfit:number(row.gross_profit),grossMargin:number(row.gross_margin),netProfit:number(row.net_profit),netMargin:number(row.net_margin),invoicedAmount:number(row.invoiced_amount),paidAmount:number(row.paid_amount),outstandingBalance:number(row.outstanding_balance),costBreakdown:(row.cost_breakdown??{}) as Record<string,number>,traceability:(row.traceability??{}) as Record<string,unknown>,calculatedAt:row.calculated_at}));
}

export function summarizeFinancialTruth(records:readonly FinancialTruthRecord[],month:string){
  const active=records.filter(record=>record.status==="CONFIRMED");const monthly=active.filter(record=>record.eventDate?.startsWith(month));
  return{monthlyRevenue:monthly.reduce((sum,row)=>sum+row.revenue,0),monthlyCosts:monthly.reduce((sum,row)=>sum+row.realCost,0),grossProfit:monthly.reduce((sum,row)=>sum+row.grossProfit,0),netProfit:monthly.reduce((sum,row)=>sum+row.netProfit,0),accountsReceivable:active.reduce((sum,row)=>sum+row.outstandingBalance,0),projectedCashFlow:active.reduce((sum,row)=>sum+row.outstandingBalance,0),active,monthly};
}
