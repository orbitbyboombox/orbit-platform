import { readFile, writeFile } from "node:fs/promises";
import bwip from "bwip-js";
import { renderTaxPdf } from "../lib/tax-pdf.mjs";

const [input, output] = process.argv.slice(2);
const data = JSON.parse(await readFile(input, "utf8"));
if (data.environment !== "offline") throw new Error("Solo laboratorio");
const logos = Object.fromEntries(await Promise.all(["boombox","orbit","pixmedia"].map(async name =>
  [name, (await readFile(new URL(`../branding/${name}-black.png`, import.meta.url))).toString("base64")])));
let syntheticStamp;
if (data.ted) {
  const text = Buffer.from(data.ted, "base64").toString("latin1");
  if (/[^\x20-\x7e]/u.test(text)) throw new Error("TED de muestra inválido");
  syntheticStamp = (await bwip.toBuffer({bcid:"pdf417",text,binarytext:true,scale:5,eclevel:5,padding:4})).toString("base64");
}
await writeFile(output,await renderTaxPdf(data.document,{issuer:data.issuer, logos, syntheticStamp}),{flag:"wx"});
