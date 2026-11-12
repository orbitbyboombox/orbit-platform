import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync('app/api/staff-portal/events/[projectId]/print-instructions/route.ts','utf8');
const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const id = '12345678-1234-1234-1234-123456789abc';
function fixture({staff='one',assigned=true,contract=null,error=false}:{staff?:string|null;assigned?:boolean;contract?:unknown;error?:boolean}={}) {
  const calls:any[]=[];
  const admin={from(table:string){const filters:any[]=[];calls.push({table,filters});const chain:any={};for(const method of ['select','eq','is','not','limit','order'])chain[method]=(...args:any[])=>{filters.push([method,...args]);return chain;};chain.maybeSingle=()=>Promise.resolve({data:contract,error:null});chain.then=(resolve:any)=>resolve({data:table==='assignments'?(assigned?[{id:'assignment'}]:[]):[],error:error?{}:null});return chain;}};
  const exports:any={};
  new Function('require','exports',code)((name:string)=>name==='next/server'?{NextResponse:{json:(body:any,options:any)=>({body,...options,status:options.status??200})}}:name.includes('admin')?{createAdminClient:()=>admin}:{loadPortalSession:async()=>staff?{staff_id:staff}:null},exports);
  return {get:()=>exports.GET(new Request('http://localhost'),{params:Promise.resolve({projectId:id})}),calls};
}
test('anonymous and unrelated staff cannot read instructions',async()=>{
  const anon=fixture({staff:null});assert.equal((await anon.get()).status,401);assert.equal(anon.calls.length,0);
  const other=fixture({assigned:false});assert.equal((await other.get()).status,403);assert.equal(other.calls.length,1);
});
test('each assigned operator gets latest canonical notes, styles and no-store',async()=>{
  for(const staff of ['one','two'])for(const style of ['COLOR','BLACK_WHITE','SEPIA']){
    const note='Línea 1\n'+ 'Texto completo '.repeat(60);
    const f=fixture({staff,contract:{photo_style:style,operator_print_notes:note}});const r=await f.get();
    assert.equal(r.status,200);assert.equal(r.body.photoStyle,style);assert.equal(r.body.operatorNote,note);assert.match(r.headers['Cache-Control'],/no-store/);
    assert.ok(f.calls[0].filters.some((x:any)=>x[0]==='eq'&&x[1]==='staff_id'&&x[2]===staff));
    assert.ok(f.calls[0].filters.some((x:any)=>x[0]==='is'&&x[1]==='deleted_at'));
    assert.ok(f.calls[0].filters.some((x:any)=>x[0]==='not'&&x[1]==='status'&&x[3].includes('REJECTED')));
    assert.deepEqual(f.calls.map(x=>x.table),['assignments','project_operational_contracts','event_paper_snapshots']);
  }
});
test('missing instructions are explicit and database errors fail closed',async()=>{
  assert.deepEqual((await fixture().get()).body,{photoStyle:null,operatorNote:'',paperVariant:null});
  assert.equal((await fixture({error:true}).get()).status,503);
});
test('new read endpoint has no write verbs and modal refreshes on focus and timer',()=>{
  assert.doesNotMatch(source,/\.upsert\(|\.update\(|\.insert\(|\.delete\(|\.rpc\(/);
  const ui=readFileSync('features/portal-authentication/staff-portal-dashboard.tsx','utf8');
  const section=ui.slice(ui.indexOf('function StaffPrintInstructions('),ui.indexOf('function EventDetail('));
  assert.match(section,/30000/);assert.match(section,/visibilitychange/);assert.match(section,/controller.abort/);assert.match(section,/overflow-wrap:anywhere/);assert.match(section,/whitespace-pre-wrap/);assert.doesNotMatch(section,/<textarea|<input|contentEditable/);
});
