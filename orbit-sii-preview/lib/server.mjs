import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ready = () => ["QA_ADMIN_PASSWORD","QA_GATEWAY_SECRET","QA_SUPABASE_ANON_KEY"].every((key)=>Boolean(process.env[key]));
const hash = (pass) => createHash("sha256").update(pass).digest();
export const validPassword = (password) => ready() && typeof password === "string" && password.length < 256 &&
  timingSafeEqual(hash(password),hash(process.env.QA_ADMIN_PASSWORD));
const sign = (s) => createHmac("sha256",process.env.QA_GATEWAY_SECRET).update("session:"+s).digest("hex");
export function sessionCookie() {
  const value = `${Date.now()+28_800_000}.${randomBytes(16).toString("hex")}`;
  return `orbit_sii_qa=${value}.${sign(value)}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`;
}
export function authenticated(req) {
  if (!ready()) return false;
  const token = /(?:^|; *)orbit_sii_qa=([^;]+)/.exec(req.headers.cookie??"")?.[1];
  if (!token || !/^\d{13}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expires, nonce, signature] = token.split(".");
  return Number(expires)>Date.now() && timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(sign(`${expires}.${nonce}`),"hex"));
}

export async function gateway(action, data={}) {
  if(!ready()) throw new Error("Entorno QA sin configurar.");
  const response = await fetch("https://yfslijqyybcakrmbwhfm.supabase.co/rest/v1/rpc/orbit_sii_phase2_qa_gateway",{
    method:"POST",signal:AbortSignal.timeout(7000),
    headers:{"apikey":process.env.QA_SUPABASE_ANON_KEY,"content-type":"application/json"},
    body:JSON.stringify({p_secret:process.env.QA_GATEWAY_SECRET,p_action:action,p_data:data})
  });
  if(!response.ok) throw new Error("El registro QA no está disponible.");
  return response.json();
}

const artifactKey = () => createHmac("sha256",process.env.QA_GATEWAY_SECRET).update("qa-artefactos-v1").digest();
export function encrypt(buffer,id,format) {
  const iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",artifactKey(),iv);
  cipher.setAAD(Buffer.from(id+":"+format));
  const payload=Buffer.concat([cipher.update(buffer),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),payload]).toString("base64");
}
export function decrypt(encoded,id,format) {
  const bytes=Buffer.from(encoded,"base64");
  const decipher=createDecipheriv("aes-256-gcm",artifactKey(),bytes.subarray(0,12));
  decipher.setAAD(Buffer.from(id+":"+format));
  decipher.setAuthTag(bytes.subarray(12,28));
  return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);
}
