import "server-only";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface SignedAgreementPdfInput {
  quotationNumber: string; customer: string; customerRut: string; customerEmail: string; customerPhone: string;
  event: string; eventDate: string; eventTime: string; services: string; hours: string; extras: string;
  venue: string; address: string; operationalContact: string; finalCustomerPrice: number;
  signaturePng?: Uint8Array; signedAt?: string; agreementVersion: string; verificationCode: string; portalUrl: string;
  documentMode?: "SIGNED_CONTRACT" | "COMMERCIAL_DOCUMENT";
  branding:{productName:string;productVersion:string;brandName:string;poweredBy:string;footer:string;currency:string;locale:string;timezone:string};
}

const PAGE:[number,number]=[595.28,841.89];
const orange=rgb(247/255,137/255,0); const dark=rgb(0.055,0.058,0.065); const ink=rgb(0.12,0.13,0.15); const muted=rgb(0.38,0.40,0.44); const pale=rgb(0.965,0.967,0.972);
const terms = [
  ["Reserva y pago", "La fecha quedará reservada una vez firmado el contrato y abonado el 50% del valor total. El saldo restante deberá pagarse durante la semana previa al evento. La reserva no es reembolsable, pues bloquea exclusivamente la fecha y horario seleccionados."],
  ["Reprogramación", "El cliente podrá solicitar un cambio de fecha, sujeto a disponibilidad de BOOMBOX. Los valores podrán actualizarse si la nueva fecha corresponde a otra temporada, ubicación o condición de servicio. La reserva podrá cederse a otra persona previa autorización escrita."],
  ["Horario contratado", "El servicio comenzará y finalizará en el horario acordado. Los atrasos propios del evento no extenderán automáticamente el servicio. Toda hora adicional deberá ser solicitada y pagada, quedando sujeta a disponibilidad."],
  ["Acceso e instalación", "El cliente deberá asegurar acceso oportuno al recinto, un espacio adecuado y conexión eléctrica independiente de 220 V. Los costos generados por esperas, restricciones o una segunda visita podrán cobrarse adicionalmente."],
  ["Traslado", "El valor del traslado se calculará automáticamente según la ubicación seleccionada y se incorporará al total del servicio. Cualquier cambio posterior de dirección podrá modificar dicho valor."],
  ["Uso y daños", "El cliente será responsable por daños, pérdidas o roturas ocasionados por él o sus invitados al equipamiento, accesorios o elementos de BOOMBOX."],
  ["Seguridad", "BOOMBOX podrá suspender el servicio si existe mal uso, riesgo para las personas, agresiones al operador o peligro para los equipos."],
  ["Contingencias técnicas", "Ante una falla atribuible a BOOMBOX, la empresa dispondrá de hasta 45 minutos para intentar solucionarla. Si no fuera posible, se devolverá proporcionalmente el valor correspondiente al tiempo no prestado."],
  ["Entrega digital", "El respaldo digital será enviado dentro de los 7 días hábiles posteriores al evento mediante un enlace disponible durante 10 días."],
  ["Fuerza mayor", "Si el servicio no puede realizarse por hechos imprevisibles o ajenos a las partes, estas procurarán reprogramarlo de común acuerdo."],
] as const;

export async function createSignedAgreementPdf(input: SignedAgreementPdfInput): Promise<Uint8Array> {
  const pdf=await PDFDocument.create(); const font=await pdf.embedFont(StandardFonts.Helvetica); const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const commercialDocument=input.documentMode==="COMMERCIAL_DOCUMENT";
  pdf.setTitle(`${commercialDocument?"Documento comercial":"Contrato"} BOOMBOX ${input.quotationNumber}`); pdf.setAuthor(input.branding.brandName); pdf.setSubject(commercialDocument?"Documento comercial oficial":"Contrato oficial firmado digitalmente");
  const money=(value:number)=>new Intl.NumberFormat(input.branding.locale,{style:"currency",currency:input.branding.currency,maximumFractionDigits:0}).format(value);

  const cover=pdf.addPage(PAGE); cover.drawRectangle({x:0,y:0,width:PAGE[0],height:PAGE[1],color:dark}); cover.drawRectangle({x:42,y:690,width:72,height:6,color:orange});
  cover.drawText(safe(input.branding.brandName).toUpperCase(),{x:42,y:735,size:13,font:bold,color:orange}); cover.drawText(commercialDocument?"DOCUMENTO CON FACTURA":"CONTRATO OFICIAL",{x:42,y:605,size:commercialDocument?27:34,font:bold,color:rgb(1,1,1)}); cover.drawText("EXPERIENCIA BOOMBOX",{x:42,y:565,size:22,font,color:rgb(.82,.83,.86)});
  cover.drawText(safe(input.customer),{x:42,y:455,size:18,font:bold,color:rgb(1,1,1)}); cover.drawText(safe(input.eventDate),{x:42,y:425,size:12,font,color:rgb(.75,.76,.8)}); cover.drawText(safe(input.quotationNumber),{x:42,y:92,size:10,font:bold,color:orange}); cover.drawText(`Versión ${safe(input.agreementVersion)}`,{x:42,y:72,size:9,font,color:rgb(.65,.67,.7)});

  const info=addPage(pdf,font,bold,input,"Información de la reserva");
  sectionTitle(info,bold,"INFORMACIÓN DEL CLIENTE",692); drawRows(info,font,bold,[["Nombre",input.customer],["RUT",input.customerRut],["Correo",input.customerEmail],["Teléfono",input.customerPhone]],660);
  sectionTitle(info,bold,"INFORMACIÓN DEL EVENTO",498); drawRows(info,font,bold,[["Evento",input.event],["Fecha",input.eventDate],["Hora de servicio",input.eventTime],["Lugar",input.venue],["Dirección",input.address],["Contacto operacional",input.operationalContact]],466);

  const commercial=addPage(pdf,font,bold,input,"Servicio contratado");
  sectionTitle(commercial,bold,"EXPERIENCIA CONTRATADA",692); drawRows(commercial,font,bold,[["Servicio",input.services],["Horas",input.hours],["Extras",input.extras],["Lugar",input.venue]],660);
  sectionTitle(commercial,bold,"RESUMEN COMERCIAL",472); drawRows(commercial,font,bold,[["Reserva 50%",money(Math.round(input.finalCustomerPrice/2))],["Saldo restante",money(input.finalCustomerPrice-Math.round(input.finalCustomerPrice/2))],["PRECIO FINAL CLIENTE",money(input.finalCustomerPrice)]],440,true);
  commercial.drawText("El cliente visualiza y acepta el precio final indicado en este contrato.",{x:42,y:220,size:9,font,color:muted});

  for(let pageIndex=0;pageIndex<2;pageIndex++){
    const page=addPage(pdf,font,bold,input,`Términos y Condiciones · ${pageIndex+1}/2`); let y=690;
    for(const [index,[title,body]] of terms.entries()){
      if(Math.floor(index/5)!==pageIndex)continue;
      page.drawText(`${index+1}. ${safe(title)}`,{x:42,y,size:11,font:bold,color:ink}); y-=20;
      y=drawWrapped(page,safe(body),42,y,510,10,15,font,muted)-22;
    }
  }

  const payment=addPage(pdf,font,bold,input,"Información de pago");
  sectionTitle(payment,bold,"DATOS PARA TRANSFERENCIA",692);
  payment.drawRectangle({x:42,y:405,width:511,height:245,color:pale,borderColor:orange,borderWidth:1.5});
  payment.drawRectangle({x:42,y:614,width:511,height:36,color:orange});
  payment.drawText("Producciones BoomBox Company SpA",{x:60,y:626,size:11,font:bold,color:dark});
  drawTransferRows(payment,font,bold,[
    ["RUT","76.565.272-3"],
    ["Banco","BCI"],
    ["Tipo de cuenta","Cuenta Corriente"],
    ["Número de cuenta","52093409"],
    ["Correo comprobantes","contabilidad@bbox.cl"],
  ],582);
  payment.drawRectangle({x:42,y:150,width:511,height:218,color:dark});
  payment.drawText("IMPORTANTE",{x:60,y:338,size:10,font:bold,color:orange});
  payment.drawText("Al realizar la transferencia indicar:",{x:60,y:312,size:11,font:bold,color:rgb(1,1,1)});
  const transferReferences=["- Nombre del cliente","- Fecha del evento","- ORBIT Event ID"];
  transferReferences.forEach((line,index)=>payment.drawText(line,{x:72,y:282-index*23,size:10,font,color:rgb(.86,.87,.89)}));
  drawWrapped(payment,"Una vez realizada la transferencia, el comprobante puede enviarse respondiendo el correo de confirmación o cargándose posteriormente en el Portal Cliente.",60,202,472,9,14,font,rgb(.75,.76,.8));

  if(!commercialDocument&&input.signaturePng&&input.signedAt){const signed=addPage(pdf,font,bold,input,"Firmas y verificación"); sectionTitle(signed,bold,"FIRMA DEL CLIENTE",692);
  const signature=await pdf.embedPng(input.signaturePng); const scaled=signature.scale(Math.min(1,250/signature.width,110/signature.height)); signed.drawRectangle({x:42,y:515,width:280,height:130,color:pale,borderColor:rgb(.82,.83,.85),borderWidth:1}); signed.drawImage(signature,{x:56,y:528,width:scaled.width,height:scaled.height}); signed.drawLine({start:{x:42,y:490},end:{x:322,y:490},thickness:1,color:ink}); signed.drawText(safe(input.customer),{x:42,y:472,size:10,font:bold,color:ink});
  sectionTitle(signed,bold,"FIRMA BOOMBOX",402); signed.drawText(safe(input.branding.brandName),{x:42,y:350,size:20,font:bold,color:orange}); signed.drawText("Firma electrónica institucional",{x:42,y:326,size:9,font,color:muted}); signed.drawLine({start:{x:42,y:306},end:{x:322,y:306},thickness:1,color:ink});
  sectionTitle(signed,bold,"VERIFICACIÓN DIGITAL",246); drawRows(signed,font,bold,[["Fecha de firma",new Intl.DateTimeFormat(input.branding.locale,{dateStyle:"long",timeStyle:"medium",timeZone:input.branding.timezone}).format(new Date(input.signedAt))],["Código de verificación",input.verificationCode],["Versión contractual",input.agreementVersion]],214);}

  const finalPage=pdf.addPage(PAGE); finalPage.drawRectangle({x:0,y:0,width:PAGE[0],height:PAGE[1],color:dark}); finalPage.drawText("MI EVENTO",{x:42,y:736,size:13,font:bold,color:orange}); finalPage.drawText("Tu experiencia BOOMBOX",{x:42,y:674,size:30,font:bold,color:rgb(1,1,1)}); finalPage.drawText("continúa aquí.",{x:42,y:638,size:30,font:bold,color:rgb(1,1,1)});
  const qrDataUrl=await QRCode.toDataURL(input.portalUrl,{margin:1,width:320,color:{dark:"#111111",light:"#FFFFFF"}}); const qr=await pdf.embedPng(Uint8Array.from(Buffer.from(qrDataUrl.split(",")[1],"base64"))); finalPage.drawRectangle({x:42,y:320,width:220,height:220,color:rgb(1,1,1)}); finalPage.drawImage(qr,{x:52,y:330,width:200,height:200});
  finalPage.drawText("Escanea el código QR",{x:302,y:493,size:13,font:bold,color:rgb(1,1,1)}); drawWrapped(finalPage,"Accede a Mi Evento para revisar tu contrato, pagos y la información esencial de tu reserva.",302,462,235,11,17,font,rgb(.75,.76,.8)); finalPage.drawText(safe(input.portalUrl),{x:302,y:380,size:9,font:bold,color:orange}); finalPage.drawText("GRACIAS POR ELEGIR BOOMBOX",{x:42,y:150,size:18,font:bold,color:rgb(1,1,1)}); finalPage.drawText("Nos alegra ser parte de tu evento.",{x:42,y:122,size:11,font,color:rgb(.75,.76,.8)});
  return pdf.save();
}

function addPage(pdf:PDFDocument,font:PDFFont,bold:PDFFont,input:SignedAgreementPdfInput,title:string){const page=pdf.addPage(PAGE);page.drawRectangle({x:0,y:760,width:PAGE[0],height:82,color:dark});page.drawText(safe(input.branding.brandName).toUpperCase(),{x:42,y:797,size:12,font:bold,color:orange});page.drawText(safe(title),{x:42,y:775,size:10,font,color:rgb(.85,.86,.88)});page.drawText(safe(input.branding.footer),{x:42,y:36,size:8,font,color:muted});return page;}
function sectionTitle(page:PDFPage,bold:PDFFont,title:string,y:number){page.drawText(title,{x:42,y,size:9,font:bold,color:orange});page.drawLine({start:{x:42,y:y-10},end:{x:553,y:y-10},thickness:.7,color:rgb(.85,.86,.88)});}
function drawRows(page:PDFPage,font:PDFFont,bold:PDFFont,rows:Array<[string,string]>,startY:number,emphasizeLast=false){let y=startY;for(const [index,[label,value]] of rows.entries()){const emphasized=emphasizeLast&&index===2;page.drawText(safe(label).toUpperCase(),{x:42,y,size:8,font:bold,color:muted});page.drawText(safe(value).slice(0,76),{x:205,y,size:emphasized?13:10,font:emphasized?bold:font,color:emphasized?orange:ink});y-=36;}return y;}
function drawTransferRows(page:PDFPage,font:PDFFont,bold:PDFFont,rows:Array<[string,string]>,startY:number){let y=startY;for(const[label,value]of rows){page.drawText(safe(label).toUpperCase(),{x:60,y,size:8,font:bold,color:muted});page.drawText(safe(value),{x:250,y,size:10,font,color:ink});y-=36;}return y;}
function drawWrapped(page:PDFPage,text:string,x:number,y:number,maxWidth:number,size:number,lineHeight:number,font:PDFFont,color=ink){const words=text.split(/\s+/);let line="";for(const word of words){const next=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(next,size)>maxWidth&&line){page.drawText(line,{x,y,size,font,color});y-=lineHeight;line=word;}else line=next;}if(line){page.drawText(line,{x,y,size,font,color});y-=lineHeight;}return y;}
function safe(value:string):string{return String(value??"").replace(/[^\x20-\x7EÀ-ÿ]/g," ");}
