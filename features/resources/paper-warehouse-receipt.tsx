"use client";
import {useState,useTransition} from "react";
import {receivePaperInWarehouse} from "./paper-warehouse.actions";
const PAIR_CAPACITY=700;
export function PaperWarehouseReceipt({supplyId}:{supplyId:string}){
 const [key,setKey]=useState(()=>crypto.randomUUID());
 const [pending,start]=useTransition();
 const [message,setMessage]=useState("");
 const [kits,setKits]=useState(0);
 const [pairs,setPairs]=useState(0);
 const total=(kits*2+pairs)*PAIR_CAPACITY;
 return <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();if(total<=0)return;const data=new FormData(event.currentTarget);data.set("quantity",String(total));data.set("reference",`${kits} kits completos + ${pairs} parejas (1 rollo + 1 tinta) · ${String(data.get("reference")??"")}`);setMessage("");start(async()=>{const result=await receivePaperInWarehouse(data);if(!result.ok){setMessage(result.error);return;}setKey(crypto.randomUUID());window.location.reload();});}}>
  <input type="hidden" name="supplyId" value={supplyId}/><input type="hidden" name="idempotencyKey" value={key}/>
  <label className="grid gap-1 text-sm font-semibold">Cajas nuevas selladas (2 rollos + 2 tintas)<input name="kits" required type="number" min="0" step="1" value={kits} onChange={e=>setKits(Math.max(0,Math.floor(Number(e.target.value)||0)))} className="min-h-11 rounded-lg border bg-background p-2"/></label>
  <label className="grid gap-1 text-sm font-semibold">Parejas sueltas (1 rollo + 1 tinta)<input name="pairs" required type="number" min="0" step="1" value={pairs} onChange={e=>setPairs(Math.max(0,Math.floor(Number(e.target.value)||0)))} className="min-h-11 rounded-lg border bg-background p-2"/></label>
  <div className="rounded-xl border p-4 sm:col-span-2"><p className="text-sm text-muted">Total físico que ingresará</p><p className="text-2xl font-bold">{kits*2+pairs} rollos + {kits*2+pairs} tintas</p><p className="text-sm font-semibold text-brand">{total.toLocaleString("es-CL")} impresiones de capacidad</p></div>
  <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Referencia del ingreso (inventario inicial, factura o compra)<input name="reference" required minLength={4} placeholder="Ej.: Conteo físico de bodega" className="min-h-11 rounded-lg border bg-background p-2"/></label>
  <button type="submit" disabled={pending||total===0} className="min-h-11 rounded-xl bg-brand px-4 font-bold text-brand-foreground disabled:opacity-50">{pending?"Registrando…":"CONFIRMAR INGRESO FÍSICO"}</button>
  {message?<p role="alert" className="text-sm sm:col-span-2">{message}</p>:null}
 </form>;
}
