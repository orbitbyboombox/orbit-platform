import "server-only";
import { gateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";
import { z } from "zod";

const schema=z.object({transferDate:z.string().nullable(),transferTime:z.string().nullable(),amount:z.number().nullable(),originBank:z.string().nullable(),transferHolder:z.string().nullable(),reference:z.string().nullable(),destinationAccount:z.string().nullable(),confidence:z.number().min(0).max(100)});
export type ReceiptExtraction=z.infer<typeof schema>;
export async function extractBankReceipt(file:File):Promise<ReceiptExtraction>{
  const bytes=Buffer.from(await file.arrayBuffer());
  const {output}=await generateText({model:gateway("openai/gpt-5.4"),output:Output.object({schema}),messages:[{role:"user",content:[{type:"text",text:"Extrae los datos visibles de este comprobante bancario chileno. No inventes: usa null si un dato no aparece. Fecha YYYY-MM-DD, hora HH:mm:ss y monto CLP numérico."},{type:"file",data:bytes,mediaType:file.type,filename:file.name}]}]});
  if(!output)throw new Error("El extractor no devolvió información estructurada.");
  return output;
}
