import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const money = (amount) => "$" + String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const escape = (value) => String(value).replace(/[<>&"']/g,(char)=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[char]));

async function artifacts(document) {
  const d = document.snapshot;
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<DocumentoSimulado version="1" ambiente="PRUEBA" validezTributaria="ninguna"><Identificacion tipo="${d.type}" folio="${document.folio}" />` +
    `<Evento id="${escape(d.eventId)}">${escape(d.event)}</Evento><Receptor>${escape(d.client)}</Receptor>` +
    d.lines.map((line)=>`<Linea><Descripcion>${escape(line.name)}</Descripcion><Neto>${line.net}</Neto></Linea>`).join("") +
    `<Montos><Descuento>${d.discount}</Descuento><Neto>${d.net}</Neto><IVA tasa="19">${d.tax}</IVA><Total>${d.total}</Total></Montos>` +
    (d.reference ? `<Referencia tipo="${d.reference.type}" folio="${d.reference.folio}">${escape(d.reference.reason)}</Referencia>` : "") +
    '</DocumentoSimulado>\n';
  const pdf = await PDFDocument.create();
  pdf.setTitle(`BOOMBOX - ${d.label} simulada`);
  const page = pdf.addPage([595,842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const line = (value,y,options={})=>page.drawText(value,{x:44,y,size:12,font,...options});
  page.drawRectangle({x:0,y:690,width:595,height:152,color:rgb(.06,.07,.09)});
  line("BOOMBOX®",777,{font:bold,size:30,color:rgb(1,1,1)});
  line("DOCUMENTO SIMULADO - SIN VALIDEZ TRIBUTARIA",735,{font:bold,color:rgb(1,.71,.3)});
  line(`${d.label} · Tipo ${d.type} · Folio QA ${document.folio}`,650,{font:bold,size:16});
  line(`${d.eventId} · ${d.event}`,618);
  line(d.client,594);
  let y=540;
  for(const item of d.lines){line(item.name,y);line(money(item.net),y,{x:440});y-=26;}
  for(const [name,value] of [["Descuento",d.discount],["Neto",d.net],["IVA (19%)",d.tax],["Total",d.total]]){
    line(name,y,{x:320,font:bold});line(money(value),y,{x:440,font:bold});y-=26;
  }
  if(d.reference){
    line(`Referencia QA: tipo ${d.reference.type}, folio ${d.reference.folio}`,y-20);
    const safeReason=d.reference.reason.replace(/[^\x20-\x7e\u00a0-\u00ff]/gu," ");
    const chunks=safeReason.match(/.{1,74}/g)??[];
    chunks.forEach((chunk,index)=>line(chunk,y-46-16*index));
  }
  return {xml:Buffer.from(xml),pdf:Buffer.from(await pdf.save())};
}

export class SimulatedTaxProvider {
  async submit(document, scenario) {
    if (scenario === "timeout") return {state:"PENDIENTE", code:"QA_TIMEOUT"};
    if (scenario === "error") return {state:"ERROR_REINTENTABLE", code:"QA_TRANSIENT"};
    return this.lookup(document);
  }

  async lookup(document) {
    return {state:"ACEPTADO", code:"QA_ACCEPTED", artifacts:await artifacts(document)};
  }
}
