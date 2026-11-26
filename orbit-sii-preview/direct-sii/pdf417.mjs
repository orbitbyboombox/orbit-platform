import {readFile,writeFile} from "node:fs/promises";
import bwip from "bwip-js";
import {renderTaxPdf} from "../lib/tax-pdf.mjs";

const [input,output]=process.argv.slice(2);
if(!input||!output) throw new Error("Uso: node direct-sii/pdf417.mjs muestra.json salida.pdf");
const sample=JSON.parse(await readFile(input,"utf8"));
if(sample.environment!=="offline"||!["11111111-1","76.565.272-3"].includes(sample.issuer.rut)) throw new Error("Solo pruebas sintéticas.");
const ted=Buffer.from(sample.ted,"base64").toString("latin1");
if (/[^\x20-\x7e]/u.test(ted)) throw new Error("El CAF contiene bytes fuera de ASCII. Verificar con el SII antes de imprimir.");
if(!ted.startsWith('<TED version="1.0">')) throw new Error("TED inválido");
const png=await bwip.toBuffer({bcid:"pdf417",text:ted,binarytext:true,scale:5,eclevel:5,padding:4});
const logos=Object.fromEntries(await Promise.all(["boombox","orbit","pixmedia"].map(async name=>[name,(await readFile(new URL(`../branding/${name}-black.png`,import.meta.url))).toString("base64")])));
const pdf=await renderTaxPdf(sample.document,{issuer:sample.issuer,logos,syntheticStamp:png.toString("base64")});
await writeFile(output,pdf,{flag:"wx"});
