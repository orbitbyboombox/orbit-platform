// Standalone sandbox adapter. The laboratory's emission endpoint keeps the simulator.
const host = "https://dev-api.haulmer.com/v2/dte/document";
const demoIssuers = new Set(["76795561-8","76430498-5"]);
const docTypes = new Set([33,39,61]);
const formats = ["XML","PDF","TIMBRE","FOLIO","RESOLUCION"];

export class OpenFacturaSandbox {
  constructor({apiKey,fetcher=fetch}) {
    if(!apiKey) throw new Error("Falta la API key del sandbox.");
    this.apiKey=apiKey;
    this.fetcher=fetcher;
  }

  async submit({operationKey,dte}) {
    const issuer=String(dte?.Encabezado?.Emisor?.RUTEmisor??"").replaceAll(".","");
    const id=dte?.Encabezado?.IdDoc;
    if(!demoIssuers.has(issuer)||!docTypes.has(id?.TipoDTE)||id.Folio!==0)
      throw new Error("Solo se admiten DTE de los emisores demo con folio por asignar.");
    if(!/^[a-z0-9-]{16,64}$/i.test(operationKey??"")) throw new Error("Falta una clave estable para esta operación.");
    const result=await this.request(host,{
      method:"POST",
      headers:{"Idempotency-Key":operationKey,"Content-Type":"application/json"},
      body:JSON.stringify({response:formats,dte})
    });
    if(result.state!=="RESPUESTA_SANDBOX") return result;
    const data=result.data;
    if(!Number.isInteger(data?.FOLIO)||data.FOLIO<=0||!data.TOKEN||!data.XML||!data.PDF||!data.TIMBRE)
      return {state:"PENDIENTE_CONCILIACION",reason:"Respuesta incompleta del sandbox"};
    return {...result,folio:data.FOLIO,token:data.TOKEN};
  }

  async lookup(token) {
    if(!/^[a-f0-9]{64}$/i.test(token??"")) throw new Error("Identificador de consulta inválido.");
    return this.request(`${host}/${token}/json`,{method:"GET"});
  }

  async request(url,options) {
    try {
      const response=await this.fetcher(url,{
        ...options,redirect:"error",signal:AbortSignal.timeout(14000),
        headers:{...options.headers,apikey:this.apiKey}
      });
      if(response.ok) return {state:"RESPUESTA_SANDBOX",data:await response.json()};
      if([400,401,403,422].includes(response.status)) return {state:"RECHAZADO_SANDBOX",httpStatus:response.status};
      return {state:"PENDIENTE_CONCILIACION",httpStatus:response.status};
    } catch {
      return {state:"PENDIENTE_CONCILIACION",reason:"Sin respuesta concluyente del proveedor"};
    }
  }
}
