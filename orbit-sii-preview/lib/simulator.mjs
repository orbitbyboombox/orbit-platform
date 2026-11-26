import { issueDay, renderTaxPdf } from "./tax-pdf.mjs";
import { sampleIssuer } from "./issuer.mjs";

const escape = (value) => String(value).replace(/[<>&"']/g,(char)=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[char]));

async function artifacts(document, options) {
  const issuer=sampleIssuer(options.issuer);
  const d = document.snapshot;
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<DocumentoSimulado version="1" ambiente="PRUEBA" validezTributaria="ninguna"><Identificacion tipo="${d.type}" folio="${document.folio}" fecha="${escape(issueDay(document))}" />` +
    `<Emisor rut="${escape(issuer.rut)}"><RazonSocial>${escape(issuer.legalName)}</RazonSocial><Domicilio>${escape(issuer.address)}</Domicilio><Comuna>${escape(issuer.city)}</Comuna></Emisor><Evento id="${escape(d.eventId)}">${escape(d.event)}</Evento><Receptor>${escape(d.client)}</Receptor>` +
    d.lines.map((line)=>`<Linea><Descripcion>${escape(line.name)}</Descripcion><Neto>${line.net}</Neto></Linea>`).join("") +
    `<Montos><Descuento>${d.discount}</Descuento><Neto>${d.net}</Neto><IVA tasa="19">${d.tax}</IVA><Total>${d.total}</Total></Montos>` +
    (d.reference ? `<Referencia tipo="${d.reference.type}" folio="${d.reference.folio}">${escape(d.reference.reason)}</Referencia>` : "") +
    '</DocumentoSimulado>\n';
  return {xml:new TextEncoder().encode(xml),pdf:await renderTaxPdf(document,options)};
}

export class SimulatedTaxProvider {
  constructor(options={}) { this.options=options; }

  async submit(document, scenario) {
    if (scenario === "timeout") return {state:"PENDIENTE", code:"QA_TIMEOUT"};
    if (scenario === "error") return {state:"ERROR_REINTENTABLE", code:"QA_TRANSIENT"};
    return this.lookup(document);
  }

  async lookup(document) {
    return {state:"ACEPTADO", code:"QA_ACCEPTED", artifacts:await artifacts(document,this.options)};
  }
}
