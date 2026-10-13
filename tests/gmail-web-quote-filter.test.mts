import assert from "node:assert/strict";
import test from "node:test";
import { parseBoomboxQuoteGmailMessage } from "../features/commercial-hub/gmail-quote-message.ts";
import { evaluateBoomboxWebLead } from "../features/commercial-hub/web-lead-intake.ts";
const body = "NUEVA COTIZACIÓN BOOMBOX\nNombre: Ana Pérez\nCorreo: ana@example.cl\nTipo de evento: Matrimonio\nFecha: 12/03/2027\n";
const sender="cotizador@boom-box.cl";
const mail={id:"mail-123",subject:"NUEVA COTIZACIÓN BOOMBOX",from:`BOOMBOX <${sender}>`,body};
test("only verified Wix formatted mail is parsed and deduped",()=>{
 const parsed=parseBoomboxQuoteGmailMessage(mail,[sender]);
 assert.ok(parsed);
 assert.equal(parsed.eventDate,"2027-03-12");
 assert.equal(evaluateBoomboxWebLead(parsed).category,"WEDDINGS");
 assert.equal(parseBoomboxQuoteGmailMessage(mail,[sender])?.submissionId,parsed.submissionId);
});
test("contacts and untrusted senders never enter quotation flow",()=>{
 assert.equal(parseBoomboxQuoteGmailMessage({...mail,subject:"Contacto desde la web"},[sender]),null);
 assert.equal(parseBoomboxQuoteGmailMessage({...mail,from:"attacker@example.com"},[sender]),null);
 assert.equal(parseBoomboxQuoteGmailMessage({...mail,body:"Hola, necesito un presupuesto"},[sender]),null);
});
test("corporate requests are manual",()=>{
 const parsed=parseBoomboxQuoteGmailMessage({...mail,body:body.replace("Matrimonio","Empresa")},[sender]);
 assert.ok(parsed);
 assert.equal(evaluateBoomboxWebLead(parsed).eligible,false);
});
