import { fixtures, preview, InputError } from "../lib/domain.mjs";
import { SimulatedTaxProvider } from "../lib/simulator.mjs";
import { createRuntime } from "../lib/server.mjs";

import { renderTaxPdf } from "../lib/tax-pdf.mjs";
const idPattern=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function present(row) {
  return {id:row.id, eventId:row.event_id,type:row.type,folio:row.folio,status:row.status,snapshot:row.snapshot,date:row.created_at,leaseUntil:row.lease_until};
}
async function settle(runtime, adapter, document, scenario, reconcile=false) {
  const {gateway,encrypt}=runtime;
  let result;
  try {
    result = reconcile ? await adapter.lookup(document) : await adapter.submit(document,scenario);
  } catch {
    result={state:"PENDIENTE",code:"QA_UNCONFIRMED"};
  }
  return present(await gateway("finish",{
    id:document.id, claim:document.claim, state:result.state, code:result.code,
    ...(result.artifacts && Object.fromEntries(await Promise.all(Object.entries(result.artifacts).map(async ([name,value])=>[name,await encrypt(value,document.id,name)]))))
  }));
}

export default async function handler(req,res,env,logos={}) {
  const settings=env ?? process.env;
  const options={issuer:settings.QA_ISSUER_PROFILE,logos};
  const adapter=new SimulatedTaxProvider(options);
  const runtime=createRuntime(env ?? process.env);
  const {ready,validPassword,sessionCookie,authenticated,gateway,decrypt}=runtime;
  res.setHeader("Cache-Control","private, no-store");
  try {
    if (!ready()) return res.status(503).json({error:"El laboratorio QA aún no está configurado."});
    if (req.method==="POST" && (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "same-origin" ||
      !/^application\/json(?:;|$)/i.test(req.headers["content-type"]??""))) return res.status(403).json({error:"Origen de solicitud inválido."});
    const body=req.body??{};
    if(req.method==="POST" && body.action==="login") {
      if(!(await validPassword(body.password))) return res.status(401).json({error:"Código administrativo incorrecto."});
      res.setHeader("Set-Cookie",await sessionCookie());
      return res.json({ok:true});
    }
    if(!(await authenticated(req))) return res.status(401).json({error:"Acceso de administración QA requerido."});
    if(req.method==="GET") {
      if(req.query.id && !idPattern.test(req.query.id)) throw new InputError("Documento inválido.");
      if(req.query.id && ["pdf","xml"].includes(req.query.format)) {
        const {artifact}=await gateway("download",{id:req.query.id,format:req.query.format});
        res.setHeader("Content-Type",req.query.format==="pdf"?"application/pdf":"application/xml");
        res.setHeader("Content-Disposition",`attachment; filename="ORBIT-QA-${req.query.id}.${req.query.format}"`);
        return res.send(await decrypt(artifact,req.query.id,req.query.format));
      }
      if(req.query.id) return res.json({audit:await gateway("audit",{id:req.query.id})});
      return res.json({events:fixtures,documents:(await gateway("list")).map(present)});
    }
    if(req.method!=="POST") return res.status(405).json({error:"Operación inválida."});
    if(body.action==="logout") {
      res.setHeader("Set-Cookie","orbit_sii_qa=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict");
      return res.json({ok:true});
    }
    if(body.action==="resume") {
      if(!idPattern.test(body.id)) throw new InputError("Documento inválido.");
      const {acquired,document}=await gateway("resume",{id:body.id});
      return res.json({document:acquired ? await settle(runtime,adapter,document,"ok",true) : present(document)});
    }
    if(!["preview","issue"].includes(body.action)) throw new InputError("Operación inválida.");
    if(body.type===61 && !idPattern.test(body.original)) throw new InputError("Selecciona el documento original.");
    const original=body.type===61 ? present(await gateway("get",{id:body.original})) : null;
    const draft=await preview(body.eventId,body.type,original,body.reason);
    if(body.action==="preview"){
      const pdf=await renderTaxPdf({snapshot:draft,folio:"POR ASIGNAR",created_at:new Date().toISOString()},options);
      return res.json({draft,pdf:btoa(Array.from(pdf,byte=>String.fromCharCode(byte)).join(""))});
    }
    if(body.hash!==draft.hash) throw new InputError("Vuelve a revisar la vista previa antes de aprobar.");
    const operation=draft.reference ? "credito:"+draft.reference.id : "venta:"+draft.eventId;
    const scenario=["ok","timeout","error"].includes(body.scenario) ? body.scenario : "ok";
    const {acquired,document}=await gateway("claim",{operation,eventId:draft.eventId,type:draft.type,snapshot:draft});
    if(!acquired && document.snapshot.hash!==draft.hash) return res.status(409).json({error:"La operación ya tiene un documento con otra versión."});
    return res.json({document:acquired ? await settle(runtime,adapter,document,scenario) : present(document),duplicate:!acquired});
  } catch(error) {
    if(error instanceof InputError) return res.status(400).json({error:error.message});
    return res.status(503).json({error:"No se confirmó la operación. Actualiza el historial antes de reintentar."});
  }
}
