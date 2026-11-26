import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sampleIssuer } from "./issuer.mjs";

export const money = amount => "$"+String(amount).replace(/\B(?=(\d{3})+(?!\d))/g,".");
export const titles = {33:"FACTURA ELECTRÓNICA",39:"BOLETA ELECTRÓNICA",56:"NOTA DE DÉBITO ELECTRÓNICA",61:"NOTA DE CRÉDITO ELECTRÓNICA"};
const ink=rgb(.07,.07,.07), white=rgb(1,1,1), red=rgb(.78,0,.09), gray=rgb(.32,.32,.32);
const mm=x=>x*72/25.4;
const W=mm(215), H=mm(280), L=mm(6), R=W-L, CW=R-L;
const safe=value=>String(value??"").normalize("NFC").replace(/[^\x20-\x7e\xa0-\xff]/gu," ").trim();
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export const issueDay=doc=>doc.issueDate??new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(doc.created_at??"2026-11-25T18:00:00Z"));
const displayDate=day=>day.split("-").reverse().join("/");

function wrap(value,font,size,width) {
  const lines=[];
  let line="";
  for (const word of safe(value).split(/\s+/).filter(Boolean)) {
    if(line&&font.widthOfTextAtSize(line+" "+word,size)>width){lines.push(line);line="";}
    if(font.widthOfTextAtSize(word,size)>width){
      let part="";
      for(const ch of word){if(part&&font.widthOfTextAtSize(part+ch,size)>width){lines.push(part);part="";}part+=ch;}
      line=part;
    }else line=line?line+" "+word:word;
  }
  if(line) lines.push(line);
  return lines;
}

export async function renderTaxPdf(doc, {issuer:configuredIssuer, logos={}, syntheticStamp}={}) {
  const d=doc.snapshot;
  if(!titles[d.type]) throw new Error("Tipo tributario no soportado.");
  const issuer=sampleIssuer(configuredIssuer);
  const pdf=await PDFDocument.create();
  pdf.setTitle(titles[d.type]+" · Muestra BOOMBOX");
  const plain=await pdf.embedFont(StandardFonts.Helvetica), bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const marks=Object.fromEntries(await Promise.all(Object.entries(logos).filter(([,v])=>v).map(async ([key,value])=>[key,await pdf.embedPng(decode(value))])));
  const stampImage=syntheticStamp ? await pdf.embedPng(decode(syntheticStamp)) : null;
  const descWidth=CW-264;
  const items=d.lines.flatMap((line,index)=>{
    const labels = [line.name];
    if (line.exempt) labels.push("Ítem exento");
    if (line.discountPct) labels.push(`Descuento de línea ${line.discountPct}% (${money(line.discountValue)})`);
    const lines=labels.flatMap(label=>wrap(label,plain,9,descWidth));
    const chunks=[];
    for(let offset=0;offset<Math.max(1,lines.length);offset+=14){
      chunks.push({...line,index,continuation:offset>0,text:lines.slice(offset,offset+14)});
    }
    return chunks;
  });
  const contractFields=[["Señor(es)",d.client],["RUT",d.rut],["Dirección",d.address],
    ["Comuna",d.city],["Giro",d.activity],["Fono",d.phone]];
  const issue=displayDate(issueDay(doc));
  const operationFields=[["Fecha emisión",issue],["Condición de pago",d.payment],
    ["Atención",d.attention],["Vendedor",d.seller ?? "ORBIT"]];
  const fieldHeight=(entries,width)=>entries.reduce((height,[,value])=>
    height+Math.max(1,wrap(value,plain,8.5,width).length)*10.5,135);
  const end=Math.max(203,fieldHeight(contractFields,274)+4,fieldHeight(operationFields,CW-460)+17);
  const tableCapacity=563-(end+35);
  if(tableCapacity<180)throw new Error("Datos del receptor exceden el espacio de la plantilla.");
  const groups=[];
  let group=[], taken=0;
  for(const row of items){
    const height=Math.max(21,row.text.length*11+9);
    if(group.length&&taken+height>tableCapacity){groups.push(group);group=[];taken=0;}
    group.push({...row,height});taken+=height;
  }
  groups.push(group);
  const reference=d.reference?wrap(`Referencia: tipo ${d.reference.type} · folio ${d.reference.folio} · ${d.reference.reason}`,plain,9,CW-14).slice(0,4):[];
  groups.forEach((rows,pageIndex)=>{
    const page=pdf.addPage([W,H]);
    const text=(value,x,top,{size=10,font=plain,color=ink,align="left",width=0}={})=>{
      const str=safe(value);if(!str)return;
      const length=font.widthOfTextAtSize(str,size);
      page.drawText(str,{x:x+(align==="right"?width-length:align==="center"?(width-length)/2:0),y:H-top-size,size,font,color});
    };
    const rect=(x,t,w,h,fill,borderColor,borderWidth=0)=>page.drawRectangle({x,y:H-t-h,width:w,height:h,color:fill,borderColor,borderWidth});
    const rule=(x,t,x2,t2,color=ink,width=.6)=>page.drawLine({start:{x,y:H-t},end:{x:x2,y:H-t2},color,thickness:width});
    const logo=(image,x,t,w,h)=>{
      if(!image)return;
      const size=image.scaleToFit(w,h);
      page.drawImage(image,{x:x+(w-size.width)/2,y:H-t-(h+size.height)/2,width:size.width,height:size.height});
    };
    rect(1,1,W-2,H-2,undefined,ink,.55);
    const divider=mm(71), logoWidth=divider-L-16;
    logo(marks.boombox,L+8,25,logoWidth,48);
    text("Experiencias que conectan",L+8,76,{size:9,font:bold,width:logoWidth,align:"center"});
    rule(divider,23,divider,98);
    const boxW=mm(60), boxH=mm(27), bx=R-boxW;
    rect(bx,21,boxW,boxH,white,red,mm(.55));
    text("R.U.T.: "+issuer.rut,bx+3,29,{size:11,color:red,font:bold,align:"center",width:boxW-6});
    wrap(titles[d.type],bold,10,boxW-12).forEach((line,index,lines)=>
      text(line,bx+3,53+(index-(lines.length-1)/2)*11,{size:10,color:red,font:bold,align:"center",width:boxW-6}));
    text("N° "+doc.folio,bx+3,78,{size:11,color:red,font:bold,align:"center",width:boxW-6});
    if(issuer.office)text("S.I.I. - "+issuer.office,bx,102,{size:9,font:bold,color:red,align:"center",width:boxW});
    const issuerX=divider+10, issuerWidth=bx-issuerX-8;
    const issuerLines=[
      [issuer.legalName,8.5,bold],
      ["RUT: "+issuer.rut,7.5,plain],
      [issuer.activity ? "Giro: "+issuer.activity : "",7.5,plain],
      [[issuer.address,issuer.city].filter(Boolean).join(", "),7.5,plain],
      [[issuer.email,issuer.website].filter(Boolean).join("  ·  "),7.5,plain],
    ];
    let issuerY=28;
    for(const [value,size,font] of issuerLines){
      for(const line of wrap(value,font,size,issuerWidth)){
        text(line,issuerX,issuerY,{size,font});
        issuerY+=10;
      }
    }
    function fields(entries,x,valueX,width){
      let y=135;
      for(const [label,value] of entries){
        text(label,x,y,{font:bold,size:8.5});
        text(":",valueX-8,y,{size:8.5});
        const lines=wrap(value,plain,8.5,width);
        lines.forEach((line,index)=>text(line,valueX,y+index*10,{size:8.5}));
        y+=Math.max(lines.length,1)*10.5;
      }
    }
    fields(contractFields,L+11,L+72,274);
    fields(operationFields,L+361,L+452,CW-460);
    rect(L,128,CW,end-128,undefined,ink,.85);
    if(doc.copy)text(doc.copy,R-71,end-15,{size:8.5,font:bold});
    text("Sin validez tributaria",L+361,end-15,{size:8.5,font:bold});
    const edges=[L,L+31,L+93,R-157,R-81,R];
    const top=end+14, body=top+21, bottom=563;
    rect(L,top,CW,21,ink);
    ["N°","Cantidad","Descripción","Precio U.","Total"].forEach((name,i)=>
      text(name,edges[i],top+5,{font:bold,color:white,align:"center",width:edges[i+1]-edges[i]}));
    rect(L,body,CW,bottom-body,undefined,ink,.8);
    for(const x of edges.slice(1,-1))rule(x,body,x,bottom);
    let y=body;
    for(const row of rows){
      if(!row.continuation){
        text(row.index+1,edges[0],y+4,{align:"center",width:31,size:9});
        text(row.textOnly ? "" : row.quantity??1,edges[1],y+4,{align:"center",width:62,size:9});
      }
      row.text.forEach((line,i)=>text(line,edges[2]+7,y+4+i*11,{size:9}));
      if(!row.continuation){
        text(row.textOnly ? "" : money(row.unitPrice??row.net),edges[3],y+4,{align:"right",width:edges[4]-edges[3]-7,size:9});
        text(money(row.net),edges[4],y+4,{align:"right",width:edges[5]-edges[4]-7,size:9});
      }
      y+=row.height;
      rule(L,y,R,y,gray,.35);
    }
    text("Powered by",L+64,589,{size:10});
    const markLeft=L+130, slot=120;
    ["boombox","orbit","pixmedia"].forEach((name,index)=>{
      const x=markLeft+slot*index;
      rule(x,583,x,604);
      logo(marks[name],x+17,581,slot-34,22);
    });
    reference.forEach((line,i)=>text(line,L+8,613+i*10,{size:8}));
    if(groups.length>1)text(`Página ${pageIndex+1} de ${groups.length}`,L,762,{size:8,align:"right",width:CW});
    if(pageIndex===groups.length-1){
      const stampX=L+10, stampY=644, stampW=mm(76), stampH=mm(33);
      if(stampImage){
        logo(stampImage,stampX,stampY,stampW,stampH);
        text("Timbre electrónico SII · Muestra",stampX,748,{align:"center",width:stampW,size:9,font:bold});
      }else{
        text("Timbre electrónico SII",stampX,685,{align:"center",width:stampW,size:9,font:bold});
        text("Omitido en esta muestra",stampX,702,{align:"center",width:stampW,size:8});
      }
      const sx=R-204, sw=198;
      const discountLabel=d.globalDiscountPct ? `Desc. afecto ${d.globalDiscountPct}%` : "Descuento";
      const totals=[...(d.discount?[[discountLabel,d.discount]]:[]),["Neto $",d.net],
        ...(d.exempt?[["Exento $",d.exempt]]:[]),["19% IVA $",d.tax],["Total $",d.total]];
      totals.forEach(([name,value],i)=>{
        const total=name==="Total $", rowHeight=18, top=648+i*rowHeight;
        rect(sx,top,sw,rowHeight,white,ink,.75);
        rule(sx+92,top,sx+92,top+rowHeight);
        const style={font:total?bold:plain,size:total?11:9,align:"right"};
        text(name,sx+4,top+4,{...style,width:80});
        text(money(value),sx+97,top+4,{...style,width:92});
      });
      if(doc.copy==="CEDIBLE"){
        text("Nombre: __________________    RUT: ____________    Fecha: ________    Recinto: ____________    Firma: ____________",L+5,765,{size:7.5});
        text("El acuse de recibo acredita la recepción de mercaderías o servicios conforme al art. 4°, letra b), y art. 5°, letra c), de la Ley 19.983.",
          L+5,778,{size:7.2});
      }
    }
  });
  return pdf.save();
}
