import {test} from "node:test";
import assert from "node:assert/strict";
import {OpenFacturaSandbox} from "../lib/openfactura-sandbox.mjs";

const operationKey="qa-documento-estable-001";
const dte={Encabezado:{IdDoc:{TipoDTE:33,Folio:0},Emisor:{RUTEmisor:"76795561-8"}}};

test("envía solo al host de desarrollo con la clave de operación del llamante",async()=>{
  const token="a".repeat(64);
  const adapter=new OpenFacturaSandbox({apiKey:"demo",fetcher:async(url,options)=>{
    assert.equal(url,"https://dev-api.haulmer.com/v2/dte/document");
    assert.equal(options.redirect,"error");
    assert.equal(options.headers["Idempotency-Key"],operationKey);
    return Response.json({FOLIO:101,TOKEN:token,XML:"demo",PDF:"demo",TIMBRE:"demo"});
  }});
  assert.equal((await adapter.submit({operationKey,dte})).folio,101);
  await assert.rejects(adapter.submit({operationKey,dte:{Encabezado:{...dte.Encabezado,Emisor:{RUTEmisor:"76565272-3"}}}}),/emisores demo/);
});

test("si falla el transporte o faltan artefactos, conserva resultado indeterminado sin reintentar",async()=>{
  let calls=0;
  const adapter=new OpenFacturaSandbox({apiKey:"demo",fetcher:async()=>{calls++;throw new Error("timeout");}});
  assert.equal((await adapter.submit({operationKey,dte})).state,"PENDIENTE_CONCILIACION");
  assert.equal(calls,1);
  const incomplete=new OpenFacturaSandbox({apiKey:"demo",fetcher:async()=>Response.json({FOLIO:101})});
  assert.equal((await incomplete.submit({operationKey,dte})).state,"PENDIENTE_CONCILIACION");
});

test("OF-06 recupera el token de la operación original para consultar sin emitir otra vez",async()=>{
  const token="b".repeat(64);
  let posts=0;
  const adapter=new OpenFacturaSandbox({apiKey:"demo",fetcher:async(url,options)=>{
    if(options.method==="POST"){
      posts++;
      return Response.json({error:{code:"OF-06",token}},{status:400});
    }
    assert.equal(url,"https://dev-api.haulmer.com/v2/dte/document/"+token+"/json");
    return Response.json({token,FchRecepSII:null});
  }});
  const repeated=await adapter.submit({operationKey,dte});
  assert.deepEqual(repeated,{state:"PENDIENTE_CONCILIACION",code:"OF-06",token});
  assert.equal((await adapter.lookup(repeated.token)).state,"RESPUESTA_SANDBOX");
  assert.equal(posts,1);
});
