"use client";
import { useState, useTransition } from "react";
import { transferPaperFromWarehouse } from "./paper-warehouse.actions";
import type { BoxAsset } from "./box-inventory";
export function PaperWarehouseTransfer({boxes,supplyId,stock}:{boxes:BoxAsset[];supplyId:string;stock:number}) {
 const [key,setKey]=useState(()=>crypto.randomUUID());
 const [pending,start]=useTransition();
 const [message,setMessage]=useState("");
 const [kits,setKits]=useState(1);
 return <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event=>{
  event.preventDefault(); const form=new FormData(event.currentTarget);form.set("quantity",String(kits*700));setMessage("");
  start(async()=>{const result=await transferPaperFromWarehouse(form);if(!result.ok){setMessage(result.error);return;}setKey(crypto.randomUUID());setMessage(result.duplicate?"Operación ya registrada, sin doble descuento.":"Transferencia registrada. Actualiza la pantalla para ver el saldo.");window.location.reload();});
 }}>
  <input type="hidden" name="supplyId" value={supplyId}/>
  <input type="hidden" name="idempotencyKey" value={key}/>
  <label className="grid gap-1 text-sm font-semibold">Caja destino<select required name="boxId" className="min-h-11 rounded-lg border bg-background p-2"><option value="">Seleccionar caja</option>{boxes.map(box=><option key={box.id} value={box.id}>{box.asset_code}</option>)}</select></label>
  <label className="grid gap-1 text-sm font-semibold">Kits de recarga a cargar (700 fotos c/u)<input required type="number" min="1" max={Math.floor(stock/700)} step="1" value={kits} onChange={e=>setKits(Math.max(1,Math.floor(Number(e.target.value)||1)))} className="min-h-11 rounded-lg border bg-background p-2"/><span className="text-xs text-muted">{(kits*700).toLocaleString("es-CL")} fotos · {kits} rollos + {kits} tintas</span></label>
  <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Motivo / referencia<input required name="reason" minLength={4} placeholder="Ej.: Reposición de papel desde bodega" className="min-h-11 rounded-lg border bg-background p-2"/></label>
  <button type="submit" disabled={pending||stock<700||kits*700>stock} className="min-h-11 rounded-xl bg-brand px-4 font-bold text-brand-foreground disabled:opacity-50">{pending?"Registrando…":"TRANSFERIR PAPEL A CAJA"}</button>
  {message?<p role="status" className="text-sm sm:col-span-2">{message}</p>:null}
  {stock<700?<p className="text-sm text-amber-600 sm:col-span-2">No hay impresiones registradas en bodega. Primero se debe registrar el ingreso real de papel.</p>:null}
 </form>;
}
