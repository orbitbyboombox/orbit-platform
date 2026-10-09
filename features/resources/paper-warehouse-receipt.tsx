"use client";
import {useState,useTransition} from "react";
import {receivePaperInWarehouse} from "./paper-warehouse.actions";
export function PaperWarehouseReceipt({supplyId}:{supplyId:string}){
 const [key,setKey]=useState(()=>crypto.randomUUID());
 const [pending,start]=useTransition();
 const [message,setMessage]=useState("");
 return <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);setMessage("");start(async()=>{const result=await receivePaperInWarehouse(data);if(!result.ok){setMessage(result.error);return;}setKey(crypto.randomUUID());window.location.reload();});}}>
  <input type="hidden" name="supplyId" value={supplyId}/><input type="hidden" name="idempotencyKey" value={key}/>
  <label className="grid gap-1 text-sm font-semibold">Cantidad de impresiones recibidas<input name="quantity" required type="number" min="1" step="1" className="min-h-11 rounded-lg border bg-background p-2"/></label>
  <label className="grid gap-1 text-sm font-semibold">Costo unitario CLP (opcional)<input name="unitCost" type="number" min="0" step="0.01" className="min-h-11 rounded-lg border bg-background p-2"/></label>
  <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Factura, compra o referencia<input name="reference" required minLength={4} placeholder="Ej.: Factura 123 - 4 rollos DNP" className="min-h-11 rounded-lg border bg-background p-2"/></label>
  <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-brand px-4 font-bold text-brand-foreground disabled:opacity-50">{pending?"Registrando…":"REGISTRAR INGRESO A BODEGA"}</button>
  {message?<p role="alert" className="text-sm sm:col-span-2">{message}</p>:null}
 </form>;
}
