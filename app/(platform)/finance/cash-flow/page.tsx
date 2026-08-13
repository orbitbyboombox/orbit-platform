import { CashFlowCenter, type CashFlowTransaction } from "@/features/cash-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function relation<T>(value:unknown):T|undefined{return Array.isArray(value)?value[0]as T|undefined:value as T|undefined}

export default async function CashFlowPage(){
  const client=await createSupabaseServerClient();
  const[paymentsResult,invoicesResult,expensesResult,staffEventsResult,staffFinancialsResult,fuelResult,vehiclesResult]=await Promise.all([
    client.from("invoice_payments").select("id,invoice_id,amount,paid_at,method,reference").order("paid_at",{ascending:false}),
    client.from("accounts_receivable_projection").select("id,invoice_number,project_id,customer_id,customer_type,due_date,amount,paid_amount,outstanding_balance,effective_status,customers(full_name),projects(name)"),
    client.from("expenses").select("id,occurred_on,category,supplier,total,status,receipt_path,approval_reason,event_staff_settlement_id").is("deleted_at",null).order("occurred_on",{ascending:false}),
    client.from("event_staff_payments").select("id,project_id,staff_id,total_internal_payment,paid_amount,paid_at,settlement_status,status,projects!inner(event_date),staff(first_name,last_name)").is("deleted_at",null).eq("status","CONFIRMED").gt("total_internal_payment",0),
    client.from("staff_settlement_financials").select("settlement_id,final_amount,remaining_balance"),
    client.from("vehicle_fuel_logs").select("id,asset_id,fuel_date,total_amount,receipt_path,gas_station"),
    client.from("vehicle_profiles").select("asset_id,model"),
  ]);
  const error=paymentsResult.error??invoicesResult.error??expensesResult.error??staffEventsResult.error??staffFinancialsResult.error??fuelResult.error??vehiclesResult.error;if(error)throw error;
  const transactions:CashFlowTransaction[]=[];const invoices=new Map((invoicesResult.data??[]).map(item=>[item.id,item]));
  for(const payment of paymentsResult.data??[]){const invoice=invoices.get(payment.invoice_id);const customer=relation<{full_name?:string}>(invoice?.customers);const project=relation<{name?:string}>(invoice?.projects);transactions.push({id:payment.id,kind:"INCOMING",date:payment.paid_at.slice(0,10),amount:Number(payment.amount),title:invoice?.customer_type==="CORPORATE"?"Pago corporativo":"Pago de reserva",detail:[invoice?.invoice_number,customer?.full_name,project?.name].filter(Boolean).join(" · ")||"Ingreso registrado",href:"/finance/receivables",source:payment.method||"Ingreso manual"});}
  const expenseReceipts=new Set((expensesResult.data??[]).map(item=>item.receipt_path).filter(Boolean));
  for(const expense of expensesResult.data??[]){if(expense.event_staff_settlement_id)continue;let metadata:Record<string,unknown>={};try{metadata=JSON.parse(expense.approval_reason??"{}");}catch{}const paid=expense.status==="PAID";transactions.push({id:expense.id,kind:paid?"OUTGOING":"PENDING_PAYMENT",date:expense.occurred_on,amount:Number(expense.total),title:expense.supplier||"Gasto BOOMBOX",detail:String(metadata.description??expense.category),href:`/finance/expenses?expense=${expense.id}`,source:expense.category});}
  const financialBySettlement=new Map((staffFinancialsResult.data??[]).map(item=>[item.settlement_id,item]));for(const payment of staffEventsResult.data??[]){const project=relation<{event_date?:string}>(payment.projects);if(!project?.event_date)continue;const member=relation<{first_name?:string;last_name?:string}>(payment.staff);const name=`${member?.first_name??""} ${member?.last_name??""}`.trim()||"Staff BOOMBOX";const paid=Number(payment.paid_amount),financial=financialBySettlement.get(payment.id),outstanding=Number(financial?.remaining_balance??Math.max(0,Number(payment.total_internal_payment)-paid));if(paid>0)transactions.push({id:`staff-paid-${payment.id}`,kind:"OUTGOING",date:payment.paid_at??project.event_date,amount:paid,title:payment.settlement_status==="ADVANCE"?"Anticipo de Staff":"Pago de Staff",detail:name,href:`/projects/${payment.project_id}#staff-assignment`,source:"Liquidación del Evento"});if(outstanding>0)transactions.push({id:`staff-pending-${payment.id}`,kind:"PENDING_PAYMENT",date:project.event_date,amount:outstanding,title:"Pago final pendiente de Staff",detail:name,href:`/projects/${payment.project_id}#staff-assignment`,source:"Liquidación del Evento"});}
  const vehicles=new Map((vehiclesResult.data??[]).map(item=>[item.asset_id,item.model]));
  for(const fuel of fuelResult.data??[]){if(expenseReceipts.has(fuel.receipt_path))continue;transactions.push({id:fuel.id,kind:"OUTGOING",date:fuel.fuel_date,amount:Number(fuel.total_amount),title:"Combustible",detail:`${vehicles.get(fuel.asset_id)??"Vehículo"} · ${fuel.gas_station}`,href:"/resources",source:"Flota"});}
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Santiago"});
  for(const invoice of invoicesResult.data??[]){if(!["PENDING","PARTIALLY_PAID","OVERDUE"].includes(invoice.effective_status)||Number(invoice.outstanding_balance)<=0)continue;const customer=relation<{full_name?:string}>(invoice.customers);transactions.push({id:invoice.id,kind:"PENDING_COLLECTION",date:invoice.due_date??today,amount:Number(invoice.outstanding_balance),title:invoice.invoice_number,detail:customer?.full_name??"Cliente BOOMBOX",href:`/finance/receivables?invoice=${invoice.id}`,source:invoice.customer_type==="CORPORATE"?"Cobranza corporativa":"Saldo de reserva",overdue:Boolean(invoice.due_date&&invoice.due_date<today)});}
  return <CashFlowCenter data={{generatedAt:new Date().toISOString(),transactions}}/>;
}
