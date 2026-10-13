import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { parseBoomboxQuoteGmailMessage } from "@/features/commercial-hub/gmail-quote-message";
import { evaluateBoomboxWebLead } from "@/features/commercial-hub/web-lead-intake";

export const runtime = "nodejs";
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailFull = { id?: string; payload?: GmailPart & { headers?: { name: string; value: string }[] }; snippet?: string };
const bodyText = (part?: GmailPart): string => {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const child of part.parts ?? []) {
    const result = bodyText(child);
    if (result) return result;
  }
  return "";
};
const equal = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));

export async function POST(request: NextRequest) {
  const secret = process.env.ORBIT_WEB_LEAD_INGEST_SECRET;
  if (!secret || !equal(request.headers.get("x-orbit-web-lead-secret") ?? "", secret)) {
    return NextResponse.json({ ok:false,error:"UNAUTHORIZED" },{status:401});
  }
  const senders = (process.env.ORBIT_WIX_QUOTE_SENDERS ?? "").split(",").map(s=>s.trim()).filter(Boolean);
  if (!senders.length) return NextResponse.json({ok:false,error:"QUOTE_SENDERS_NOT_CONFIGURED"},{status:503});
  let token: string;
  try { token = await loadGoogleWorkspaceAccessToken(); }
  catch { return NextResponse.json({ok:false,error:"GMAIL_RECONNECT_REQUIRED"},{status:503}); }
  const get = async (url: string): Promise<Response> => fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:"no-store",signal:AbortSignal.timeout(12000)});
  let list: Response;
  try { list = await get("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&q="+encodeURIComponent('subject:"NUEVA COTIZACIÓN BOOMBOX" -in:trash -in:spam')); }
  catch { return NextResponse.json({ok:false,error:"GMAIL_UNREACHABLE"},{status:502}); }
  if (!list.ok) return NextResponse.json({ok:false,error:"GMAIL_READ_NOT_AUTHORIZED",httpStatus:list.status},{status:503});
  const index = await list.json() as { messages?: {id:string}[] };
  const db=createAdminClient();
  let inserted=0,duplicates=0,skipped=0,failed=0;
  for(const item of (index.messages??[])){
    try {
      const res=await get("https://gmail.googleapis.com/gmail/v1/users/me/messages/"+encodeURIComponent(item.id)+"?format=full");
      if(!res.ok) {failed++;continue;}
      const msg=await res.json() as GmailFull;
      const headers=msg.payload?.headers??[];
      const header=(key:string)=>headers.find(h=>h.name.toLowerCase()===key)?.value??"";
      const lead=parseBoomboxQuoteGmailMessage({id:item.id,subject:header("subject"),from:header("from"),body:bodyText(msg.payload)},senders);
      if(!lead){skipped++;continue;}
      const decision=evaluateBoomboxWebLead(lead);
      if(!decision.dedupeKey||!decision.normalizedEmail||!decision.sourceDomain){skipped++;continue;}
      const {data,error}=await db.from("web_quote_intakes").upsert({
        dedupe_key:decision.dedupeKey,source_domain:decision.sourceDomain,
        full_name:lead.name??"",email:decision.normalizedEmail,phone:lead.phone??null,
        event_type:lead.eventType??"",event_date:lead.eventDate??"",
        category:decision.category,mode:decision.eligible?"AUTO_DRAFT":"MANUAL_REVIEW",
        status:decision.eligible?"RECEIVED":"PENDING_REVIEW",raw_payload:{gmailMessageId:item.id,source:"GMAIL_WIX_FORM"},
      },{onConflict:"dedupe_key",ignoreDuplicates:true}).select("id").maybeSingle();
      if(error){failed++;continue;}
      if(data)inserted++;else duplicates++;
    }catch{failed++;}
  }
  return NextResponse.json({ok:failed===0,inserted,duplicates,skipped,failed,autoSendEnabled:false},{status:failed?503:200,headers:{"Cache-Control":"no-store"}});
}
