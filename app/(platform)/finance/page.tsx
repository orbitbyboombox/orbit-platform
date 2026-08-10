import { ProfitEngine, ProfitabilityExperience, SupabaseProfitRepository } from "@/features/profit-engine";
import { SupplyEngine, SupabaseSupplyRepository } from "@/features/supply-engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowRight, ReceiptText } from "lucide-react";
import { FinancialDashboard } from "@/features/finance/components/financial-dashboard";

export default async function FinancePage() {
  const client = await createSupabaseServerClient();
  const profitRepository = new SupabaseProfitRepository(client);
  const supplyRepository = new SupabaseSupplyRepository(client);
  const [events, supplies, expensesResult, receivablesResult, quotationsResult] = await Promise.all([
    profitRepository.findAll(), supplyRepository.findAll(),
    client.from("expenses").select("id,supplier,occurred_on,total,vat,status").is("deleted_at",null).order("occurred_on",{ascending:false}),
    client.from("accounts_receivable_projection").select("outstanding_balance,effective_status,due_date").not("effective_status","in",'(PAID,CANCELLED,DRAFT)'),
    client.from("quotations").select("tax_total,created_at").eq("status","ACCEPTED").is("deleted_at",null),
  ]);
  const error=expensesResult.error??receivablesResult.error??quotationsResult.error;if(error)throw error;
  const engine = new ProfitEngine(new SupplyEngine(supplies));
  const insights = engine.calculateInsights(events);
  const recommendation = engine.getRecommendation(insights);
  const monthKey=new Date().toISOString().slice(0,7);const today=new Date();const inDays=(date:string|null,days:number)=>date?new Date(date).getTime()>=new Date(today.toISOString().slice(0,10)).getTime()&&new Date(date).getTime()<=today.getTime()+days*86400000:false;
  const monthlyEvents=events.filter((event)=>event.createdAt.startsWith(monthKey));
  const monthlyExpenses=(expensesResult.data??[]).filter((expense)=>expense.occurred_on?.startsWith(monthKey));
  const monthlyRevenue=monthlyEvents.reduce((sum,event)=>sum+event.revenue,0);const expensesTotal=monthlyExpenses.reduce((sum,expense)=>sum+Number(expense.total??0),0);const grossMargin=monthlyEvents.reduce((sum,event)=>sum+event.estimatedGrossMargin,0);
  const accountsReceivable=(receivablesResult.data??[]).reduce((sum,item)=>sum+Number(item.outstanding_balance??0),0);const accountsPayable=(expensesResult.data??[]).filter((expense)=>expense.status==="PENDING").reduce((sum,expense)=>sum+Number(expense.total??0),0);
  const outputVat=(quotationsResult.data??[]).filter((quotation)=>quotation.created_at?.startsWith(monthKey)).reduce((sum,quotation)=>sum+Number(quotation.tax_total??0),0);const inputVat=monthlyExpenses.reduce((sum,expense)=>sum+Number(expense.vat??0),0);
  const dashboard={monthlyRevenue,monthlyExpenses:expensesTotal,accountsReceivable,accountsPayable,projectedCashFlow:accountsReceivable-accountsPayable,grossMargin,netMargin:grossMargin-expensesTotal,projectedVat:Math.max(0,outputVat-inputVat),overdueAccounts:(receivablesResult.data??[]).filter((item)=>item.effective_status==="OVERDUE").reduce((sum,item)=>sum+Number(item.outstanding_balance??0),0),upcomingPayments:accountsPayable,upcomingCollections:(receivablesResult.data??[]).filter((item)=>inDays(item.due_date,7)).reduce((sum,item)=>sum+Number(item.outstanding_balance??0),0),expenses:(expensesResult.data??[]).map((expense)=>({id:expense.id,supplier:expense.supplier??"Proveedor sin identificar",date:expense.occurred_on,total:Number(expense.total??0),status:expense.status}))};

  return <div className="space-y-10"><FinancialDashboard data={dashboard}/><Link className="group flex items-center justify-between gap-4 rounded-2xl border border-brand/25 bg-brand/5 p-5 transition hover:border-brand/50" href="/finance/receivables"><div className="flex items-center gap-4"><span className="grid size-11 place-items-center rounded-xl bg-brand/10 text-brand"><ReceiptText className="size-5"/></span><div><p className="font-semibold">Cuentas por Cobrar</p><p className="mt-1 text-sm text-muted">Facturas, vencimientos, pagos y antigüedad de saldos.</p></div></div><ArrowRight className="size-5 text-muted transition group-hover:translate-x-1 group-hover:text-brand"/></Link><div className="scroll-mt-24" id="profitability"><ProfitabilityExperience events={events} insights={insights} recommendation={recommendation} supplies={supplies}/></div></div>;
}
