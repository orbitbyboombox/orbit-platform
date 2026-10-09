import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PaperWarehouseReceipt } from "@/features/resources/paper-warehouse-receipt";
import { PaperWarehouseTransfer } from "@/features/resources/paper-warehouse-transfer";
import { loadBoxes, blackBoxStock, blackBoxNumber } from "@/features/resources/box-inventory";

export default async function PaperWarehousePage() {
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: profile } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) redirect("/resources/boxes");
  const [boxes, suppliesResult, receiptsResult, transfersResult, equipmentResult] = await Promise.all([
    loadBoxes(client),
    client.from("supplies").select("id,name,catalog_code,current_stock,minimum_stock,unit,stock_status").is("deleted_at", null).order("name"),
    client.from("paper_warehouse_receipts").select("id,quantity,stock_before,stock_after,reference,created_at").order("created_at",{ascending:false}).limit(25),
    client.from("paper_warehouse_transfers").select("id,quantity,warehouse_before,warehouse_after,box_before,box_after,reason,created_at,box_asset_id").order("created_at",{ascending:false}).limit(25),
    client.from("paper_inventory_equipment_purchases").select("id,item_name,quantity,unit_cost_net,supplier,invoice_number,invoice_date").order("invoice_date",{ascending:false}).limit(20),
  ]);
  if (suppliesResult.error) throw suppliesResult.error;
  if (receiptsResult.error) throw receiptsResult.error;
  if (transfersResult.error) throw transfersResult.error;
  if (equipmentResult.error) throw equipmentResult.error;
  const supplies = (suppliesResult.data ?? []).filter((item) => /papel|paper|4x6|4 x 6|prepicado|impresi|dnp|media/i.test([item.name,item.catalog_code].join(" ")));
  const paper = supplies.find(item=>item.catalog_code==="dnp-rx1-media");
  const stock=Number(paper?.current_stock??0);
  const costPerPrint=218629/1400;
  const netPurchased=2623548;
  const netEquipment=(equipmentResult.data??[]).reduce((sum,item)=>sum+Number(item.unit_cost_net)*Number(item.quantity),0);
  return <main className="space-y-6 p-4 sm:p-6">
    <header className="rounded-2xl border bg-card p-5">
      <Link href="/resources/boxes" className="text-sm font-semibold text-brand">← Volver a Cajas</Link>
      <h1 className="mt-3 text-3xl font-bold">Bodega de papel</h1>
      <p className="mt-2 text-sm text-muted">Control por kit de recarga: 1 rollo de papel + 1 cinta de tinta = 700 fotos. Una caja comercial sellada trae 2 kits de recarga.</p>
    </header>
    <section className="grid gap-3 sm:grid-cols-3"><article className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted">Papel disponible en bodega</p><p className="mt-2 text-3xl font-bold">{stock.toLocaleString("es-CL")} <span className="text-base font-normal">fotos</span></p><p className="text-sm text-muted">{Math.floor(stock/700)} kits de recarga de 700 fotos + {stock%700} fotos</p></article><article className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted">Compra papel · Factura 4379</p><p className="mt-2 text-3xl font-bold">{netPurchased.toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0})}</p><p className="text-sm text-muted">12 cajas comerciales = 24 kits de recarga · neto, sin IVA</p></article><article className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted">Equipo inalámbrico · WCM Plus</p><p className="mt-2 text-3xl font-bold">{netEquipment.toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0})}</p><p className="text-sm text-muted">No se incluye en costo de fotos</p></article></section>
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Existencias registradas en bodega</h2>
      <p className="mt-1 text-xs text-muted">La unidad principal es el kit de recarga (1 papel + 1 tinta), con capacidad de 700 fotos. Una caja comercial trae 2 kits de recarga.</p>
      {supplies.length === 0 ? <p className="mt-4 rounded-xl border p-4 text-sm">No hay insumos de papel identificados en el catálogo. No se ha inventado stock.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{supplies.map((item) => <article key={item.id} className="rounded-xl border p-4"><h3 className="font-semibold">{item.name}</h3><p className="mt-2 text-2xl font-bold">{item.current_stock ?? "Sin dato"} <span className="text-sm font-normal">{item.unit ?? "unidades"}</span></p><p className="mt-1 text-xs text-muted">Mínimo: {item.minimum_stock ?? "No definido"} · {item.stock_status ?? "Sin estado"}</p></article>)}</div>}
    </section>
    <section className="rounded-2xl border bg-card p-5"><h2 className="text-xl font-semibold">Costo de referencia · Factura 4379</h2><p className="mt-1 text-sm text-muted">Bravo Soluciones SpA · 09/10/2026. Referencia contable, no inventario ingresado automáticamente.</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-4"><p className="text-xs text-muted">Caja comercial DNP RX1 · neto</p><p className="text-xl font-bold">$218.629</p><p className="text-xs text-muted">2 kits de recarga × 700 fotos</p></div><div className="rounded-xl border p-4"><p className="text-xs text-muted">Costo neto por impresión</p><p className="text-xl font-bold">$156,16</p><p className="text-xs text-muted">Referencia, no modifica eventos</p></div><div className="rounded-xl border p-4"><p className="text-xs text-muted">Compra facturada</p><p className="text-xl font-bold">12 kits</p><p className="text-xs text-muted">$2.623.548 netos · WCM Plus excluido</p></div></div><p className="mt-3 text-sm text-muted">Inventario inicial registrado: 24 kits de recarga de factura 4379 (16.800 fotos), más 3 kits de recarga de compras anteriores (2.100 fotos), total 27 kits de 700 fotos. Los sobrantes anteriores no tienen costo histórico comprobado; el valor de $156,16 por foto es referencia para futuras estimaciones, no una valorización contable de esos sobrantes.</p></section>
    <section className="rounded-2xl border bg-card p-5"><h2 className="text-xl font-semibold">Equipos y accesorios comprados</h2><div className="mt-3 space-y-2">{(equipmentResult.data??[]).map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm"><span>{item.item_name} · {item.quantity} unidad · Factura {item.invoice_number} · {item.supplier}</span><strong>{(Number(item.unit_cost_net)*Number(item.quantity)).toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0})} netos</strong></div>)}</div></section>
    <section className="rounded-2xl border bg-card p-5"><h2 className="text-xl font-semibold">Ingreso de compras y reposición de papel</h2><p className="mt-1 text-sm text-muted">Ingresa cajas comerciales selladas (2 kits de recarga) y kits de recarga sueltos (1 papel + 1 tinta). El costo no se mezcla con las cantidades.</p>{supplies.filter(item=>item.catalog_code==="dnp-rx1-media"&&item.unit==="PHOTO").map(item=><PaperWarehouseReceipt key={item.id} supplyId={item.id}/>)}</section>
    <section className="rounded-2xl border bg-card p-5"><h2 className="text-xl font-semibold">Cargar papel desde bodega a caja</h2><p className="mt-1 text-sm text-muted">Selecciona la caja operativa y la cantidad de fotos a cargar. Solo se transfiere material que ya está registrado físicamente en bodega.</p>{supplies.filter(item=>item.catalog_code==="dnp-rx1-media"&&item.unit==="PHOTO").map(item=><PaperWarehouseTransfer key={item.id} boxes={boxes} supplyId={item.id} stock={Number(item.current_stock??0)}/>)}</section>
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Papel cargado en cajas</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{boxes.map((box) => {const stock=blackBoxStock(box.metadata);return <article key={box.id} className="rounded-xl border p-4"><h3 className="font-semibold">Caja {blackBoxNumber(box.asset_code)}</h3><p className="mt-2 text-2xl font-bold">{stock} <span className="text-sm font-normal">impresiones</span></p>{stock < 100 ? <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-sm font-semibold text-amber-600">Falta cargar papel: bodega a caja número {blackBoxNumber(box.asset_code)}</p> : <p className="mt-2 text-xs text-muted">Stock sobre el umbral de alerta</p>}</article>;})}</div>
    </section>
    <section className="rounded-2xl border bg-card p-5"><h2 className="text-xl font-semibold">Historial de movimientos de bodega</h2><div className="mt-4 space-y-2 text-sm">{[...(receiptsResult.data??[]).map(item=>({id:item.id,created_at:item.created_at,label:"Ingreso",detail:item.reference,quantity:item.quantity})),...(transfersResult.data??[]).map(item=>({id:item.id,created_at:item.created_at,label:"Bodega → "+(boxes.find(box=>box.id===item.box_asset_id)?.asset_code??"Caja"),detail:item.reason,quantity:-item.quantity}))].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,40).map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><span>{new Date(item.created_at).toLocaleString("es-CL")} · <strong>{item.label}</strong> · {item.detail}</span><strong>{item.quantity>0?"+":""}{item.quantity} impresiones</strong></div>)}</div></section>
    <p className="text-sm text-muted">Las transferencias requieren saldo real en bodega. Los ingresos de compras y ajustes de inventario deben registrarse por separado y con respaldo.</p>
  </main>;
}
