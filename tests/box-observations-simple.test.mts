import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isNoIssueObservation, incidentBoxLabel, mapIncidentObservation } from '../features/resources/incident-observation.ts';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
const src=(path:string)=>readFileSync(path,'utf8');
test('box names are immediately readable without inventing an assignment',()=>{
  assert.equal(incidentBoxLabel('CASE-02'),'Caja 2');assert.equal(incidentBoxLabel('CASE-07'),'Caja 7');assert.equal(incidentBoxLabel(null),'Caja no registrada');
});
test('only explicit no-issue reports stop appearing as repair alerts',()=>{
  for(const report of ['Nada',' NADA. ','Sin observaciones','Sin novedades','Todo bien','Todo OK!','Ninguna'])assert.equal(isNoIssueObservation(report),true,report);
  for(const report of ['Nada de papel','Todo bien salvo el cable dañado','No queda nada de tinta','Se perdieron 2 lápices',''])assert.equal(isNoIssueObservation(report),false,report);
});
test('card shows canonical event, box, full observation and operator',()=>{
  const observation='Cable dañado\n'+ 'Texto '.repeat(200);
  const value=mapIncidentObservation({id:'one',project_id:'project',description:observation,status:'OPEN',operational_assets:[{asset_code:'CASE-02'}],projects:{name:'Evento actual'},staff:{first_name:'Nombre',last_name:'Operador'}},{event_name:'Evento antiguo',box_code:'CASE-07'});
  assert.equal(value.box,'Caja 2');assert.equal(value.event,'Evento actual');assert.equal(value.observation,observation);assert.equal(value.staff,'Nombre Operador');
  assert.equal(mapIncidentObservation({id:'two',description:'Problema'},{box_code:'CASE-03'}).box,'Caja 3');
});
test('repair card exposes observation immediately and has no diagnostic/event gate',()=>{
  const code=src('features/resources/incident-quick-card.tsx');assert.match(code,/<h3[^>]*>\{incident.box\}/);assert.match(code,/\{incident.observation\}/);assert.match(code,/>REPARADO</);assert.match(code,/GUARDAR Y DEJAR RESUELTO/);assert.doesNotMatch(code,/inspectFounderAction|REVISAR|Diagnóstico del pendiente/);
});
test('event includes the same source observations and retains resolved history',()=>{
  const page=src('app/(platform)/projects/[projectId]/page.tsx'),panel=src('features/resources/event-incident-observations.tsx');
  assert.match(page,/from\("event_incidents"\)/);assert.match(page,/incidentObservations=/);assert.match(panel,/operator-observations/);assert.match(panel,/item.observation/);assert.match(panel,/item.resolution/);assert.match(panel,/Sin incidencias/);
});
test('read model excludes resolved and no-issue reports without deleting records',()=>{
  const loader=src('features/founder-action-center/index.ts');assert.match(loader,/incident.status === "RESOLVED" \|\| isNoIssueObservation\(incident.description\)/);assert.doesNotMatch(loader,/\.delete\(|\.update\(/);
  const staff=src('features/portal-authentication/staff-portal.actions.ts');const action=staff.slice(staff.indexOf('export async function reportStaffOperatorIncidentAction'),staff.indexOf('export async function requestStaffResponsibilityAction'));
  assert.ok(action.indexOf('if (isNoIssueObservation(description))')<action.indexOf('.insert({'));assert.ok(action.indexOf('if (!assignment)')<action.indexOf('if (isNoIssueObservation(description))'));
});
test('server-rendered compact repair card is accessible and escapes observations',()=>{
  const code=ts.transpileModule(src('features/resources/incident-quick-card.tsx'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports:any={};new Function('require','exports',code)((name:string)=>name==='next/link'?{default:({children,...props}:any)=>require('react').createElement('a',props,children)}:name.includes('incident-resolution.actions')?{recordIncidentResolution:async()=>({ok:true})}:require(name),exports);
  const html=require('react-dom/server').renderToStaticMarkup(require('react').createElement(exports.IncidentQuickCard,{incident:mapIncidentObservation({id:'one',description:'<script>danger</script>',operational_assets:{asset_code:'CASE-02'}}),onResolved(){}}));
  assert.match(html,/Caja 2/);assert.match(html,/REPARADO/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});
test('repair action checks admin, preserves a previous resolution, and only calls the incident RPC',async()=>{
  const code=ts.transpileModule(src('features/founder-action-center/incident-resolution.actions.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  for(const status of ['OPEN','RESOLVED']){
    const calls:any[]=[],paths:string[]=[];
    const client={from(table:string){assert.equal(table,'event_incidents');return{select(){return{eq(){return{maybeSingle:async()=>({data:{project_id:'project',status},error:null})}}}}}},rpc:async(name:string,args:any)=>{calls.push({name,args});return{error:null}}};
    const exports:any={};new Function('require','exports',code)((name:string)=>name==='next/cache'?{revalidatePath:(value:string)=>paths.push(value)}:{requireDiagnosticAdmin:async()=>({client})},exports);
    assert.equal((await exports.recordIncidentResolution('11111111-1111-4111-8111-111111111111','Cable reemplazado y probado')).ok,true);
    assert.equal(calls.length,status==='OPEN'?1:0);
    if(status==='OPEN'){assert.equal(calls[0].name,'resolve_staff_operator_incident');assert.equal(calls[0].args.p_resolution,'Cable reemplazado y probado');assert.ok(paths.includes('/projects/project'));}
    assert.equal((await exports.recordIncidentResolution('invalid','ok')).ok,false);
  }
});
