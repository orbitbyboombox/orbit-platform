const $ = (selector) => document.querySelector(selector);
const login=$("#login"), workspace=$("#workspace"), notice=$("#notice"), draftForm=$("#draft-form"), issueForm=$("#issue-form");
const state={events:[],documents:[],draft:null};
const currency=new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP"});
const money=(value)=>currency.format(value);
const label={ACEPTADO:"Aceptado",PENDIENTE:"Pendiente de conciliación",ERROR_REINTENTABLE:"Error recuperable",PROCESANDO:"Procesando",APROBADO:"Aprobación registrada",CONCILIACION_SOLICITADA:"Conciliación solicitada",DESCARGADO:"Archivo descargado"};
const html=(value)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const date=(value)=>new Intl.DateTimeFormat("es-CL",{timeZone:"America/Santiago",dateStyle:"short",timeStyle:"short"}).format(new Date(value));
async function api(body,query="") {
  const response=await fetch("/api/tributario"+query,{cache:"no-store",signal:AbortSignal.timeout(18000),...(body ? {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)} : {})});
  const result=await response.json();
  if(!response.ok){ const error=new Error(result.error??"Error de laboratorio.");error.status=response.status;throw error; }
  return result;
}
function inform(message){notice.textContent=message;}
function access(active){login.hidden=active;workspace.hidden=!active;$("#logout").hidden=!active;}
function clearDraft(){
  state.draft=null;
  $("#draft").innerHTML='<p class="empty">Selecciona un evento y genera la vista previa para revisar el detalle, los impuestos y el total.</p>';
  issueForm.hidden=true;
}
function renderDraft(){
  const d=state.draft;
  const line=(name,value,classes="")=>`<div class="line ${classes}"><span>${html(name)}</span><strong>${money(value)}</strong></div>`;
  $("#draft").innerHTML=`<article class="paper"><p class="label">BOOMBOX® · VISTA PREVIA SIN VALIDEZ TRIBUTARIA</p>
    <h3>${html(d.label)} · ${d.type}</h3><p>${html(d.eventId)} · ${html(d.event)}</p><p>${html(d.client)} · ${html(d.rut)}</p>
    <p>${html(d.payment)}</p><div class="amounts">${d.lines.map(i=>line(i.name,i.net)).join("")}</div>
    ${d.reference ? `<p>Referencia QA · Tipo ${d.reference.type}, folio ${d.reference.folio}</p><p>${html(d.reference.reason)}</p>` : ""}
    <div class="amounts">${line("Descuento",d.discount)}${line("Neto",d.net)}${line("IVA · 19%",d.tax)}${line("Total",d.total,"total")}</div></article>`;
  issueForm.hidden=false;
}
function renderEvent(resetType=false){
  const event=state.events.find(e=>e.id===draftForm.elements.event.value);
  if(!event)return;
  if(resetType)draftForm.elements.type.value=event.documentType;
  for(const option of draftForm.elements.type.options)option.disabled=Number(option.value)!==event.documentType && option.value!=="61";
  const old=draftForm.elements.original.value;
  const eligible=state.documents.filter(d=>d.status==="ACEPTADO"&&d.eventId===event.id&&d.type!==61);
  draftForm.elements.original.replaceChildren(new Option("Selecciona un documento aceptado",""),...eligible.map(d=>new Option(`${d.snapshot.label} · Folio QA ${d.folio}`,d.id)));
  if(eligible.some(d=>d.id===old))draftForm.elements.original.value=old;
  $("#credit").hidden=draftForm.elements.type.value!=="61";
  $("#event-facts").innerHTML=`<strong>${html(event.id)} · ${html(event.name)}</strong><span>${html(event.kind)} · ${html(event.client)}</span><span>${html(event.payment)} · Venta acordada ${money(event.agreedTotal)}</span>`;
}
function operationInput(){
  return {eventId:draftForm.elements.event.value,type:Number(draftForm.elements.type.value),original:draftForm.elements.original.value,reason:draftForm.elements.reason.value};
}
function renderHistory(){
  const docs=state.documents;
  $("#metrics").innerHTML=[["Documentos registrados",docs.length],["Aceptados",docs.filter(x=>x.status==="ACEPTADO").length],["Por resolver",docs.filter(x=>x.status!=="ACEPTADO").length]].map(([name,n])=>`<div class="metric"><strong>${n}</strong><span>${name}</span></div>`).join("");
  if(!docs.length){$("#history").innerHTML='<p class="empty">Aún no hay documentos emitidos en el laboratorio.</p>';return;}
  $("#history").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Folio QA</th><th>Documento y evento</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead><tbody>${docs.map(d=>`
    <tr><td><strong>${d.folio}</strong><small>${date(d.date)}</small></td><td>${html(d.snapshot.label)} · ${d.type}<small>${html(d.eventId)}</small></td>
    <td><span class="badge ${d.status==="ACEPTADO"?"ok":""}">${html(label[d.status])}</span></td><td>${money(d.snapshot.total)}</td>
    <td><div class="tools"><button class="quiet" data-audit="${html(d.id)}">Auditoría</button>${
      d.status==="ACEPTADO" ? ["pdf","xml"].map(format=>`<a class="action" href="/api/tributario?id=${encodeURIComponent(d.id)}&amp;format=${format}">${format.toUpperCase()}</a>`).join("") :
      `<button class="quiet" data-resume="${html(d.id)}">Conciliar</button>`
    }</div></td></tr>`).join("")}</tbody></table></div>`;
}
function selectView(tab){
  const finance=tab==="finance";
  $("#finance-view").hidden=!finance;
  $("#event-view").hidden=finance;
  $("#finance-tab").setAttribute("aria-pressed",String(finance));
  $("#event-tab").setAttribute("aria-pressed",String(!finance));
}
function renderEventView(){
  $("#event-list").innerHTML=state.events.map(event=>{
    const docs=state.documents.filter(d=>d.eventId===event.id);
    return `<article class="panel"><p class="eyebrow">${html(event.id)}</p><h2>${html(event.name)}</h2>
      <div class="event-facts"><strong>${html(event.client)}</strong><span>${html(event.date)} · ${html(event.kind)}</span><span>${html(event.payment)}</span>
      <span>Venta acordada ${money(event.agreedTotal)}</span></div>
      <ul>${event.lines.map(line=>`<li>${html(line.name)} · ${money(line.net)}</li>`).join("")}
      ${event.discount ? `<li>Descuento · ${money(event.discount)}</li>` : ""}</ul>
      <div class="event-facts"><strong>Documentos tributarios QA</strong>
      ${docs.length ? docs.map(d=>`<span>${html(d.snapshot.label)} · Folio ${d.folio} · ${html(label[d.status])}</span>`).join("") : "<span>Sin emisión simulada</span>"}</div>
      <button type="button" class="quiet" data-event-open="${html(event.id)}">Abrir facturación del evento</button></article>`;
  }).join("");
}
$("#finance-tab").addEventListener("click",()=>selectView("finance"));
$("#event-tab").addEventListener("click",()=>selectView("events"));
$("#event-list").addEventListener("click",e=>{
  const button=e.target.closest("[data-event-open]");
  if(!button)return;
  draftForm.elements.event.value=button.dataset.eventOpen;
  clearDraft();renderEvent(true);selectView("finance");draftForm.elements.event.focus();
});
async function load(){
  const {events,documents}=await api();
  const selected=draftForm.elements.event.value;
  state.events=events;state.documents=documents;
  draftForm.elements.event.replaceChildren(...events.map(e=>new Option(e.name,e.id)));
  if(events.some(e=>e.id===selected))draftForm.elements.event.value=selected;
  renderEvent(!selected);renderHistory();renderEventView();access(true);
}
async function act(button,work){
  button.disabled=true;inform("");
  try{await work();}catch(error){
    if(error.status===401&&button.closest("#workspace")) access(false);
    inform(error.name==="TimeoutError" ? "Tiempo de espera agotado. Actualiza el historial antes de repetir la operación." : error.message);
  }finally{button.disabled=false;}
}
$("#login-form").addEventListener("submit",e=>{
  e.preventDefault();void act(e.submitter,async()=>{await api({action:"login",password:$("#login-form").elements.password.value});$("#login-form").reset();await load();});
});
$("#logout").addEventListener("click",e=>void act(e.currentTarget,async()=>{await api({action:"logout"});clearDraft();access(false);}));
draftForm.addEventListener("input",e=>{if(e.target.name==="event"||e.target.name==="type")renderEvent(e.target.name==="event");clearDraft();});
draftForm.addEventListener("submit",e=>{
  e.preventDefault();void act(e.submitter,async()=>{const requested=operationInput();const {draft}=await api({action:"preview",...requested});if(JSON.stringify(requested)!==JSON.stringify(operationInput()))return;state.draft=draft;renderDraft();});
});
issueForm.addEventListener("submit",e=>{
  e.preventDefault();if(!state.draft)return;const hash=state.draft.hash,scenario=issueForm.elements.scenario.value,input=operationInput();
  void act(e.submitter,async()=>{const result=await api({action:"issue",hash,scenario,...input});clearDraft();await load();inform(`${result.duplicate?"Solicitud repetida · mismo folio":"Resultado de la emisión"}: QA ${result.document.folio} · ${label[result.document.status]}.`);});
});
$("#reload").addEventListener("click",e=>void act(e.currentTarget,load));
$("#history").addEventListener("click",e=>{
  const button=e.target.closest("button[data-audit],button[data-resume]");
  if(!button)return;
  void act(button,async()=>{
    if(button.dataset.resume){
      const {document}=await api({action:"resume",id:button.dataset.resume});
      await load();inform(`Folio QA ${document.folio} · ${label[document.status]}.`);return;
    }
    const {audit}=await api(undefined,"?id="+encodeURIComponent(button.dataset.audit));
    $("#audit").innerHTML=audit.map(a=>`<p><strong>${html(label[a.action]??a.action)}</strong><br><small>${date(a.at)} · ${html(a.actor)} ${a.code ? "· "+html(a.code) : ""}</small></p>`).join("");
    $("#audit-dialog").showModal();
  });
});
$("#close-audit").addEventListener("click",()=>$("#audit-dialog").close());
load().catch(error=>{access(false);if(error.status!==401)inform(error.message);});
