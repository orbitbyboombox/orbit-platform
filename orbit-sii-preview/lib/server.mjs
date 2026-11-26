const encoder=new TextEncoder();
const hex=(bytes)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
const digest=(value)=>crypto.subtle.digest("SHA-256",encoder.encode(value));
const b64=(bytes)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(""));
const unb64=(value)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const random=(size)=>crypto.getRandomValues(new Uint8Array(size));
function equal(left,right) {
  if(left.length!==right.length) return false;
  let delta=0;
  for(let i=0;i<left.length;i++) delta|=left.charCodeAt(i)^right.charCodeAt(i);
  return delta===0;
}

export function createRuntime(env) {
  const ready=()=>["QA_ADMIN_PASSWORD","QA_GATEWAY_SECRET","QA_SUPABASE_ANON_KEY"].every((key)=>Boolean(env[key]));
  const hmac=()=>crypto.subtle.importKey("raw",encoder.encode(env.QA_GATEWAY_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sign=async (value)=>hex(await crypto.subtle.sign("HMAC",await hmac(),encoder.encode("session:"+value)));
  const key=async ()=>crypto.subtle.importKey("raw",await crypto.subtle.sign("HMAC",await hmac(),encoder.encode("qa-artefactos-v1")),"AES-GCM",false,["encrypt","decrypt"]);
  return {
    ready,
    async validPassword(password){
      return ready() && typeof password==="string" && password.length<256 &&
        equal(hex(await digest(password)),hex(await digest(env.QA_ADMIN_PASSWORD)));
    },
    async sessionCookie(){
      const value=`${Date.now()+28_800_000}.${hex(random(16))}`;
      return `orbit_sii_qa=${value}.${await sign(value)}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`;
    },
    async authenticated(req){
      if(!ready()) return false;
      const token=/(?:^|; *)orbit_sii_qa=([^;]+)/.exec(req.headers.cookie??"")?.[1];
      if(!token || !/^\d{13}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) return false;
      const [expires,nonce,signature]=token.split(".");
      return Number(expires)>Date.now() && equal(signature,await sign(`${expires}.${nonce}`));
    },
    async gateway(action,data={}){
      const response=await fetch("https://yfslijqyybcakrmbwhfm.supabase.co/rest/v1/rpc/orbit_sii_phase2_qa_gateway",{
        method:"POST",signal:AbortSignal.timeout(7000),
        headers:{"apikey":env.QA_SUPABASE_ANON_KEY,"authorization":"Bearer "+env.QA_SUPABASE_ANON_KEY,"content-type":"application/json"},
        body:JSON.stringify({p_secret:env.QA_GATEWAY_SECRET,p_action:action,p_data:data})
      });
      if(!response.ok) throw new Error("El registro QA no está disponible.");
      return response.json();
    },
    async encrypt(bytes,id,format){
      const iv=random(12);
      const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:encoder.encode(id+":"+format)},await key(),bytes);
      const joined=new Uint8Array(iv.length+encrypted.byteLength);
      joined.set(iv);joined.set(new Uint8Array(encrypted),iv.length);
      return b64(joined);
    },
    async decrypt(encoded,id,format){
      const bytes=unb64(encoded);
      return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes.subarray(0,12),additionalData:encoder.encode(id+":"+format)},await key(),bytes.subarray(12)));
    }
  };
}
