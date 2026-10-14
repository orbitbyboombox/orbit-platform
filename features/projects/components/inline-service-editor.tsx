"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeServiceAction, getServiceOptionsAction, type ServiceOption } from "@/features/projects/actions/service-change.actions";

export function InlineServiceEditor({projectId,currentCode,currentDuration,commercialLocked}:{projectId:string;currentCode:string;currentDuration:string;commercialLocked:boolean}) {
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [options,setOptions]=useState<ServiceOption[]>([]);
 const [code,setCode]=useState(currentCode);
 const [hours,setHours]=useState(Number.parseInt(currentDuration,10)||2);
 const [message,setMessage]=useState("");
 const [pending,startTransition]=useTransition();
 useEffect(()=>{if(!open)return;let mounted=true;getServiceOptionsAction().then(rows=>{if(mounted)setOptions(rows)}).catch(()=>{if(mounted)setMessage("No se pudo cargar el catálogo de servicios.")});return()=>{mounted=false}},[open]);
 const services=useMemo(()=>Array.from(new Map(options.map(row=>[row.code,row.label])).entries()),[options]);
 const selected=options.find(row=>row.code===code&&row.hours===hours);
 const previous=options.find(row=>row.code===currentCode&&row.hours===(Number.parseInt(currentDuration,10)||2));
 const canSave=Boolean(selected)&&!commercialLocked&&(code!==currentCode||hours!==(Number.parseInt(currentDuration,10)||2));
 return <div className="mt-4 rounded-xl border border-brand/30 p-3 sm:p-4">
  <button type="button" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-black" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{open?"Cerrar edición":"Editar servicio"}</button>
  {open?<div className="mt-4 grid gap-3">
   <p className="text-sm text-muted">Cambia el servicio aquí, sin salir del evento.</p>
   <label className="grid gap-1 text-xs font-medium">Servicio
    <select className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm" value={code} onChange={e=>{setCode(e.target.value);setMessage("")}}>
     {!services.some(([key])=>key===currentCode)?<option value={currentCode}>{currentCode}</option>:null}
     {services.map(([key,label])=><option key={key} value={key}>{label}</option>)}
    </select>
   </label>
   <label className="grid gap-1 text-xs font-medium">Duración
    <select className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm" value={hours} onChange={e=>{setHours(Number(e.target.value));setMessage("")}}>
     {[2,3,4].filter(h=>options.some(row=>row.code===code&&row.hours===h)).map(h=><option key={h} value={h}>{h} horas</option>)}
     {!options.length?<option value={hours}>{hours} horas</option>:null}
    </select>
   </label>
   {selected?<div className="rounded-xl border bg-background/40 p-3 text-sm">
    <p>Precio de catálogo: <strong>{new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(selected.price)}</strong></p>
    {previous?<p className="mt-1 text-xs text-muted">Diferencia de catálogo: {new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0}).format(selected.price-previous.price)} (no reemplaza un precio negociado)</p>:null}
   </div>:null}
   {commercialLocked?<p className="rounded-xl border border-amber-600/40 p-3 text-xs text-muted">Este evento ya tiene cotización formal. Para aplicar un cambio se necesita una revisión comercial; no se modificarán automáticamente montos, pagos ni contratos.</p>:null}
   <button type="button" disabled={!canSave||pending} className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50" onClick={()=>{
    if(!selected||!window.confirm("¿Confirmar cambio de servicio en este evento? No se enviarán correos."))return;
    startTransition(async()=>{const result=await changeServiceAction({projectId,previousCode:currentCode,nextCode:code,hours});setMessage(result.message);if(result.ok){setOpen(false);router.refresh()}});
   }}>{pending?"Guardando…":"Guardar cambio"}</button>
   {message?<p className="text-sm" role="status">{message}</p>:null}
  </div>:null}
 </div>;
}