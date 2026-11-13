import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as policy from "../features/automatic-booking/scrapbook-policy.ts";
import * as servicePricing from "../features/automatic-booking/service-pricing.ts";
import { buildCanonicalOperationalExtras } from "../features/operations/canonical-operational-extras.ts";

type Row = Record<string, unknown>;
const source = readFileSync(new URL("../features/automatic-booking/complete-automatic-booking.service.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const require = createRequire(import.meta.url);
function fixture() {
  const rows: Record<string, Row[]> = {
    automatic_booking_invitations:[{id:"qa-invitation",created_by:"qa-actor",customer_email:"qa@example.invalid",status:"OPENED",state:"DRAFT",payload:{smokeFixture:true},project_id:null}],
    commercial_prices:[{category:"SERVICE",code:"CLASSIC",unit_price:330000,duration_hours:2,rules:{}},{category:"EXTRA",code:"SCRAPBOOK",unit_price:50000,pricing_status:"DEFINED"}],
  };
  const rpcCalls: string[] = [];
  let handoff: Row | null = null;
  const admin = {
    from(table: string) {
      let mode="select", values:Row={}, single=false, domain="";
      const filters: Array<[string,unknown]> = [];
      const query = {
        select(){return query;}, insert(value:Row){mode="insert";values=value;return query;},
        update(value:Row){mode="update";values=value;return query;}, upsert(value:Row){mode="upsert";values=value;return query;},
        eq(key:string,value:unknown){if(key==="domain")domain=String(value);if(key==="id"||key==="project_id")filters.push([key,value]);return query;},
        is(){return query;},in(){return query;},gt(){return query;},order(){return query;},limit(){return query;},
        single(){single=true;return query;},maybeSingle(){single=true;return query;},
        then(resolve:(result:unknown)=>unknown){
          if(table==="master_data_entries")return Promise.resolve(resolve({data:domain==="SERVICES"?[{code:"CLASSIC",configuration:{}}]:null,error:null}));
          const tableRows=rows[table]??(rows[table]=[]);
          if(mode==="insert"||mode==="upsert")tableRows.push({id:`qa-${table}-${tableRows.length}`,...values});
          if(mode==="update")for(const row of tableRows.filter(row=>filters.every(([key,value])=>row[key]===value)))Object.assign(row,values);
          const selected=tableRows.filter(row=>filters.every(([key,value])=>row[key]===value));
          // Return detached data like a real database response.
          return Promise.resolve(resolve({data:structuredClone(single?selected[0]??null:selected),error:null}));
        },
      };return query;
    },
    async rpc(name:string){rpcCalls.push(name);return {data:name==="allocate_quotation_number"?"QA-RESERVATION":name==="preflight_reservation_capacity"?{status:"AVAILABLE"}:null,error:null};},
  };
  const exported:Record<string,unknown>={};
  runInNewContext(compiled,{
    exports:exported,Buffer,performance,console:{info(){},error(){}},setTimeout,
    require:(id:string)=>{
      if(id==="node:crypto")return require(id);
      if(id==="./scrapbook-policy")return policy;
      if(id==="./service-pricing")return servicePricing;
      if(id==="@/lib/supabase/admin")return {createAdminClient:()=>admin};
      if(id.includes("municipality-master-data"))return {loadActiveMunicipalities:async()=>[{name:"QA",transport:35000}]};
      if(id.includes("venue-resolution"))return {resolveCanonicalVenue:()=>null};
      if(id==="./automatic-booking.service")return {automaticBookingTokenHash:(value:string)=>value};
      if(id.includes("automatic-booking-smoke"))return {isAutomaticBookingSmokeMode:()=>true,smokeSinkId:(kind:string,id:string)=>`smoke:${kind}:${id}`};
      if(id==="@/lib/chile/rut")return {isValidChileanRut:()=>true};
      if(id==="@/lib/phone/e164")return {requirePhoneE164:(value:string)=>value};
      if(id.includes("event-window"))return {normalizeEventWindow:()=>({startAt:"2027-03-20T22:00:00Z",endAt:"2027-03-21T00:00:00Z"}),BookingTimeInvalidError:class extends Error{}};
      if(id==="@/features/connectors/google-calendar")return {generateOrbitEventId:()=>"QA-EVENT"};
      if(id.includes("digital-signature.service"))return {confirmDigitalSignature:async()=>({portalUrl:"https://example.invalid/p/qa"})};
      if(id.includes("confirmed-reservation-orchestrator"))return {confirmPersistedReservation:async(input:Row)=>{handoff=input;}};
      if(id.includes("whatsapp-observability"))return {serializeWhatsAppError:(error:unknown)=>String(error)};
      return {};
    },
  });
  return {rows,rpcCalls,getHandoff:()=>handoff,complete:exported.completeAutomaticBooking as (input:unknown)=>Promise<{total:number;reservation:number;balance:number}>};
}
function submission(type:string,extras:string[]) {
  return {token:"qa-token",ipAddress:"127.0.0.1",userAgent:"QA",submission:{
    customer:{name:"QA SCRAPBOOK",email:"qa@example.invalid",rut:"12.345.678-5",phone:"+56912345678",address:"QA"},
    event:{type,date:"2027-03-20",time:"22:00",venue:"QA",address:"QA",municipality:"QA",operationalContact:"QA",operationalPhone:"+56912345678"},
    service:{code:"CLASSIC",hours:2,extras,brandingQuantity:2},
    payment:{method:"TRANSFER",receiptName:"qa.png",receiptType:"image/png",receiptBase64:Buffer.alloc(32).toString("base64")},signatureDataUrl:"data:image/png;base64,QA",
  }};
}
for(const type of ["Private","Birthday"])test(`${type}: real confirmation carries SCRAPBOOK through event, reservation, contract and canonical handoff (memory adapters)`,async()=>{
  const f=fixture();const result=await f.complete(submission(type,["SCRAPBOOK"]));
  const project=f.rows.projects[0];
  assert.deepEqual(JSON.parse(JSON.stringify((project.operations as Row).extras)),["Scrapbook"]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.rows.project_services[0].extras)),["Scrapbook"]);
  assert.equal(result.total,415000);assert.equal(result.reservation,207500);assert.equal(result.balance,207500);
  assert.equal(f.rows.quotations[0].grand_total,415000);
  assert.equal(((f.rows.agreements[0].rendered_contract as Row).commercialSummary as Row).total,415000);
  assert.equal(f.rows.automatic_booking_invitations[0].state,"CONFIRMED");
  assert.equal(f.getHandoff()?.projectId,project.id);
  assert.equal(f.getHandoff()?.smokeMode,true);
  assert.equal(buildCanonicalOperationalExtras({serviceExtras:f.rows.project_services[0].extras as string[]}).categories.SCRAPBOOK,true);
  assert.equal(f.rows.projects.length,1);assert.equal(f.rows.project_services.length,1);
});
test("deselection persists no SCRAPBOOK and preserves base amount",async()=>{
  const f=fixture();const result=await f.complete(submission("Birthday",[]));
  assert.equal(result.total,365000);
  assert.deepEqual(JSON.parse(JSON.stringify(f.rows.project_services[0].extras)),[]);
  assert.equal(buildCanonicalOperationalExtras({serviceExtras:f.rows.project_services[0].extras as string[]}).categories.SCRAPBOOK,false);
});
test("forged forbidden selection cannot create customer, event, contract or payment",async()=>{
  const f=fixture();await assert.rejects(f.complete(submission("Wedding",["SCRAPBOOK"])));
  for(const table of ["customers","projects","project_services","quotations","agreements","documents"])assert.equal(f.rows[table]?.length??0,0);
  assert.equal(f.rpcCalls.length,0);assert.equal(f.getHandoff(),null);
});
