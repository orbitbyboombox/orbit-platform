import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { canCompleteDiagnostics, diagnosticSolution, operationalTarget, safeActionHref } from '../features/founder-action-center/diagnostic-model.ts';
const require = createRequire(import.meta.url), ts = require('typescript');
const source = (path: string) => readFileSync(path, 'utf8');
const model = { canCompleteDiagnostics, diagnosticSolution, operationalTarget, safeActionHref };
function compile(path: string, modules: Record<string, unknown>) {
  const output = ts.transpileModule(source(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: any = {};
  new Function('require','exports',output)((name: string) => { if (!(name in modules)) throw new Error(`Unexpected import ${name}`); return modules[name]; }, exports);
  return exports;
}
const id='11111111-1111-4111-8111-111111111111';
function fixture({type='STAFF_OPERATOR_INCIDENT',role='CEO',authenticated=true,status='OPEN',error=false,metadata={box_code:'CASE-02'},reasons=[{code:'CONTACT',label:'Falta confirmar contacto en terreno.'}]}:any={}) {
  const calls: any[]=[];
  const notification = {id,notification_type:type,title:'Revisar',message:'Mensaje completo',status:'UNREAD',action_required:true,project_id:id,entity_id:id,related_href:`/projects/${id}`,metadata,projects:{name:'Evento de prueba',orbit_event_id:'QA-001',operations:{physicalConfiguration:'UNDEFINED'}}};
  const admin={from(table:string){calls.push(table);const chain:any={};for(const method of ['select','eq','is','not','order','limit'])chain[method]=()=>chain;
    const value=()=>({error:error?{message:'Database unavailable'}:null,data:table==='internal_notifications'?notification:table==='event_incidents'?{id,status,description:'Componente faltante\n'+ 'texto '.repeat(100),operational_assets:null}:table==='project_operational_contracts'?{readiness_status:status==='RESOLVED'?'READY':'NOT_READY',readiness_reasons:reasons}:table==='accounts_receivable_projection'?{id,invoice_number:'Q1',outstanding_balance:status==='RESOLVED'?0:5000,effective_status:status==='RESOLVED'?'PAID':'OVERDUE',due_date:'2026-01-01',projects:{name:'Prueba'}}:null});
    chain.maybeSingle=async()=>value();chain.then=(resolve:any)=>resolve(value());return chain;}};
  const client={auth:{getUser:async()=>({data:{user:authenticated?{id}:null},error:null})},from(){return{select(){return{eq(){return{maybeSingle:async()=>({data:{role},error:null})}}}}}}};
  const service=compile('features/founder-action-center/diagnostics.service.ts',{'server-only':{},'@/lib/supabase/server':{createSupabaseServerClient:async()=>client},'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/features/finance/finance-read-model':{loadFinanceDashboardReadModel:async()=>({risks:status==='RESOLVED'?[]:[{key:'OVERDUE_COLLECTIONS',label:'Cobros',count:2,detail:'Dos facturas',href:'/finance/receivables?status=overdue'}]})},'./diagnostic-model':model});
  return {service,calls};
}
test('anonymous and Staff cannot inspect administrative diagnostics',async()=>{
  for(const args of [{authenticated:false},{role:'STAFF'},{role:'OPERATIONS'}]){const f=fixture(args);await assert.rejects(f.service.loadActionDiagnostic(id));assert.deepEqual(f.calls,[]);}
});
test('incident uses exact report, preserves unknown box and reads canonical resolved status',async()=>{
  const open=await fixture().service.loadActionDiagnostic(id);assert.equal(open.box,'CASE-02');assert.equal(open.resolved,false);assert.match(open.problem,/Componente faltante\n/);assert.ok(open.problem.length>500);assert.match(open.targets[0].href,/\/resources\/boxes\/incidents\/.*#resolution$/);
  const missing=await fixture({metadata:{}}).service.loadActionDiagnostic(id);assert.match(missing.box,/no registrada/);
  assert.equal((await fixture({status:'RESOLVED'}).service.loadActionDiagnostic(id)).resolved,true);
});
test('readiness reads current reasons and opens the specific editable field',async()=>{
  const d=await fixture({type:'EVENT_NOT_READY'}).service.loadActionDiagnostic(id);assert.equal(d.problem,'Falta confirmar contacto en terreno.');assert.match(d.targets[0].href,/eventTab=OPERATION&operationField=contactFirstName#operations-readiness/);
  assert.equal((await fixture({type:'EVENT_NOT_READY',status:'RESOLVED'}).service.loadActionDiagnostic(id)).resolved,true);
});
test('all canonical categories have a diagnosis and a safe module target',async()=>{
  for(const type of ['STAFF_ONBOARDING_REVIEW_REQUIRED','STAFF_EXPENSE_REVIEW_REQUIRED','STAFF_BOLETA_REVIEW_REQUIRED','HEALTH_WARNING','PHYSICAL_CONFIGURATION_MISSING','SALES_LEAD_UNATTENDED','SALES_QUOTE_NO_FOLLOWUP','SALES_FOLLOWUP_OVERDUE','SALES_NO_NEXT_ACTION','SALES_CUSTOMER_REPLIED','SALES_RESERVATION_PENDING','SALES_LEAD_STALLED','WHATSAPP_WAITING_FOR_BOOMBOX','WHATSAPP_HUMAN_STALE','WHATSAPP_UNREAD_CRITICAL']){
    const d=await fixture({type}).service.loadActionDiagnostic(id);assert.ok(d.solution.length>30,type);assert.equal(d.resolved,false,type);assert.ok(d.targets[0].href.startsWith('/'),type);
  }
});
test('invoice and finance risks are projected from their current source',async()=>{
  for(const key of [`founder-action:invoice:${id}`,'finance-risk:OVERDUE_COLLECTIONS']){
    assert.equal((await fixture().service.loadActionDiagnostic(key)).resolved,false);
    assert.equal((await fixture({status:'RESOLVED'}).service.loadActionDiagnostic(key)).resolved,true);
  }
});
test('missing data and database failures never certify LISTO',async()=>{
  await assert.rejects(fixture({error:true}).service.loadActionDiagnostic(id));
  assert.equal(canCompleteDiagnostics([]),false);
  assert.equal(canCompleteDiagnostics([{resolved:true},{resolved:false}] as any),false);
  assert.equal(canCompleteDiagnostics([{resolved:true}] as any),true);
});
test('LISTO rechecks the server source and rejects active problems',async()=>{
  for(const resolved of [true,false]){
    const actions=compile('features/founder-action-center/diagnostic.actions.ts',{'next/cache':{revalidatePath(){}},'./diagnostics.service':{loadActionDiagnostic:async()=>({resolved})},'./diagnostic-model':model});
    const result=await actions.validateFounderActions([id]); assert.equal(result.ok,resolved,JSON.stringify(result));
    assert.equal((await actions.validateFounderActions([])).ok,false);
  }
});
test('diagnostic links cannot become external navigation or script URLs',()=>{
  for(const href of ['//evil.test','https://evil.test','javascript:alert(1)','/\\evil.test','/foo\nbar'])assert.equal(safeActionHref(href),'/notifications');
  assert.equal(safeActionHref('/resources/staff?reviewExpense=123'),'/resources/staff?reviewExpense=123');
  assert.match(operationalTarget(id,'SCHEDULE'),/operationField=serviceStartAt/);
});
test('diagnosis and LISTO have no operational writes; incident resolution uses the existing scoped RPC only',()=>{
  for(const path of ['diagnostics.service.ts','diagnostic.actions.ts'])assert.doesNotMatch(source('features/founder-action-center/'+path),/\.update\(|\.insert\(|\.delete\(|\.upsert\(|\.rpc\(/);
  const resolution=source('features/founder-action-center/incident-resolution.actions.ts');assert.match(resolution,/requireDiagnosticAdmin/);assert.match(resolution,/resolve_staff_operator_incident/);assert.doesNotMatch(resolution,/paid_amount|inventory|closeout|\.update\(|\.upsert\(/);
});
test('mobile cards wrap complete details, expose all records and use server-validated LISTO',()=>{
  const panel=source('features/founder-action-center/diagnostic-panel.tsx'),workspace=source('features/founder-workspace/founder-workspace-experience.tsx'),loader=source('features/founder-action-center/index.ts');
  assert.match(panel,/whitespace-pre-wrap/);assert.match(panel,/overflow-wrap:anywhere/);assert.match(panel,/min-h-11/);assert.match(panel,/aria-expanded/);assert.match(panel,/validateFounderActions/);
  assert.match(workspace,/Ver más pendientes/);assert.doesNotMatch(workspace,/LISTO GRUPO|dismissFounderActionsAction/);
  assert.match(loader,/return \(await loadFounderActionCenter\(userId\)\)\.count/);assert.doesNotMatch(loader,/dismissed\.has/);assert.match(loader,/range\(offset, offset \+ 499\)/);
});
