import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sampleIssuer } from "./issuer.mjs";

export const money = amount => "$"+String(amount).replace(/\B(?=(\d{3})+(?!\d))/g,".");
export const titles = {33:"FACTURA ELECTRÓNICA",39:"BOLETA ELECTRÓNICA",61:"NOTA DE CRÉDITO ELECTRÓNICA"};
const ink=rgb(.07,.07,.07), white=rgb(1,1,1), orange=rgb(1,.37,0), red=rgb(.78,0,.09), gray=rgb(.32,.32,.32), pale=rgb(.95,.95,.95);
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
  const descWidth=264;
  const items=d.lines.flatMap((line,index)=>{
    const lines=wrap(line.name,plain,10,descWidth);
    const chunks=[];
    for(let offset=0;offset<Math.max(1,lines.length);offset+=14){
      chunks.push({...line,index,continuation:offset>0,text:lines.slice(offset,offset+14)});
    }
    return chunks;
  });
  const groups=[];
  let group=[], taken=0;
  for(const row of items){
    const height=Math.max(26,row.text.length*13+9);
    if(group.length&&taken+height>220){groups.push(group);group=[];taken=0;}
    group.push({...row,height});taken+=height;
  }
  groups.push(group);
  const issue=displayDate(issueDay(doc));
  const reference=d.reference?wrap(`Referencia: tipo ${d.reference.type} · folio QA ${d.reference.folio} · ${d.reference.reason}`,plain,9,CW-14).slice(0,4):[];
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
    if(marks.boombox)logo(marks.boombox,L+12,20,254,62);
    text("Experiencias que conectan",L+12,86,{size:13,font:bold,width:254,align:"center"});
    rule(L+13,94,L+53,94,orange,2);rule(L+224,94,L+265,94,orange,2);
    const boxW=mm(80), boxH=mm(31), bx=R-boxW;
    rect(bx,26,boxW,boxH,white,red,mm(.65));
    text("R.U.T.: "+issuer.rut,bx+4,39,{size:12,color:red,font:bold,align:"center",width:boxW-8});
    const taxName=wrap(titles[d.type],bold,13,boxW-14);
    taxName.forEach((line,i)=>text(line,bx+4,57+i*14,{size:13,color:red,font:bold,align:"center",width:boxW-8}));
    text("N° "+doc.folio,bx+4,92,{size:13,color:red,font:bold,align:"center",width:boxW-8});
    if(issuer.office)text("S.I.I. - "+issuer.office,bx,120,{size:10,font:bold,color:red,align:"center",width:boxW});
    text(issuer.legalName,L+12,111,{size:13,font:bold});
    if(issuer.activity)text("Giro: "+issuer.activity,L+12,131);
    text([issuer.address,issuer.city].filter(Boolean).join(" · "),L+12,145);
    text([issuer.email,issuer.website].filter(Boolean).join("  |  "),L+12,159);
    rect(L,181,CW,70,white,ink,.7);rule(L+CW*.55,190,L+CW*.55,242,orange,1);
    text("Señor(es):",L+10,191,{font:bold});text(d.client,L+75,191);
    text("R.U.T.:",L+10,208,{font:bold});text(d.rut,L+75,208);
    text("Evento:",L+10,225,{font:bold});text(d.event,L+75,225);
    const cx=L+CW*.55+12;
    text("Fecha de emisión:",cx,191,{font:bold});text(issue,cx+110,191);
    text("Condición de pago:",cx,208,{font:bold});text(d.payment,cx+110,208,{size:9});
    text("SIN VALIDEZ TRIBUTARIA",cx,227,{size:9,color:red,font:bold});
    const edges=[L,L+36,L+91,L+363,L+466,R];
    rect(L,269,CW,23,ink);
    ["N°","Cantidad","Descripción","Precio unitario","Total"].forEach((name,i)=>text(name,edges[i],275,{font:bold,color:white,align:"center",width:edges[i+1]-edges[i]}));
    const bottom=522;
    rect(L,292,CW,bottom-292,undefined,ink,.7);
    for(const x of edges.slice(1,-1))rule(x,292,x,bottom);
    let y=298;
    for(const row of rows){
      if(!row.continuation){
        text(row.index+1,edges[0],y,{align:"center",width:36});
        text("1",edges[1],y,{align:"center",width:55});
      }
      row.text.forEach((line,i)=>text(line,edges[2]+8,y+i*13));
      if(!row.continuation){
        text(money(row.net),edges[3],y,{align:"right",width:edges[4]-edges[3]-8});
        text(money(row.net),edges[4],y,{align:"right",width:edges[5]-edges[4]-8});
      }
      y+=row.height;
    }
    reference.forEach((line,i)=>text(line,L+7,528+i*11,{size:9,color:gray}));
    if(groups.length>1)text(`Página ${pageIndex+1} de ${groups.length}`,L,570,{size:9,color:gray,align:"right",width:CW});
    text("Powered by",L+12,596,{size:9,color:gray});
    const markLeft=L+81, slot=(CW-90)/4;
    ["boombox","pixmedia","orbit","nova"].forEach((name,index)=>{
      const x=markLeft+slot*index;
      rule(x,585,x,611,gray,.5);
      logo(marks[name],x+7,581,slot-14,33);
    });
    if(pageIndex===groups.length-1){
      const stampX=mm(20), stampY=641, stampW=mm(73),stampH=mm(31);
      rect(stampX,stampY,stampW,stampH,white,gray,.6);
      if(stampImage){
        logo(stampImage,stampX+4,stampY+4,stampW-8,stampH-23);
        text("PDF417 SINTÉTICO · SIN VALIDEZ",stampX,stampY+stampH-15,{align:"center",width:stampW,size:9,font:bold});
      }else{
        text("TIMBRE ELECTRÓNICO",stampX,stampY+26,{align:"center",width:stampW,font:bold});
        text("Omitido en esta muestra",stampX,stampY+44,{align:"center",width:stampW,size:9,color:gray});
      }
      const sx=L+305, sw=R-sx;
      const totals=[...(d.discount?[["Descuento",d.discount]]:[]),["Neto",d.net],["IVA (19%)",d.tax],["Total",d.total]];
      totals.forEach(([name,value],i)=>{
        const total=name==="Total", top=641+i*24;
        rect(sx,top,sw,24,total?orange:pale,total?orange:ink,.55);
        text(name,sx+11,top+5,{font:bold,size:total?14:11});
        text(money(value),sx+5,top+5,{font:bold,size:total?14:11,align:"right",width:sw-16});
      });
    }
    text("DOCUMENTO SIMULADO · SIN VALIDEZ TRIBUTARIA",L,752,{align:"center",width:CW,color:red,font:bold,size:11});
    rect(L,773,CW-155,10,ink);rect(R-149,773,149,10,orange);
  });
  return pdf.save();
}
