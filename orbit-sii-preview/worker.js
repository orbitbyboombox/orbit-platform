import handler from "./api/tributario.js";
import html from "./index.html";
import css from "./styles.css";
import js from "./ui.js?text";
import boombox from "./branding/boombox-print.png";
import orbit from "./branding/orbit-print.png";
import pixmedia from "./branding/pixmedia-print.png";
import nova from "./branding/nova-print.png";

const assets={"/":[html,"text/html"],"/index.html":[html,"text/html"],"/styles.css":[css,"text/css"],"/ui.js":[js,"text/javascript"]};
const security={
  "X-Content-Type-Options":"nosniff",
  "X-Robots-Tag":"noindex, nofollow",
  "Referrer-Policy":"no-referrer",
  "Content-Security-Policy":"default-src 'self'; frame-src blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname!=="/api/tributario"){
      if(!Object.hasOwn(assets,url.pathname)) return new Response("Página no disponible.",{status:404,headers:security});
      const [body,type]=assets[url.pathname];
      return new Response(body,{headers:{...security,"Content-Type":type+"; charset=utf-8"}});
    }
    let body;
    if(request.method==="POST"){
      const raw=await request.text();
      if(raw.length>4096)return new Response(JSON.stringify({error:"Solicitud demasiado larga."}),{status:413,headers:{"Content-Type":"application/json"}});
      try {body=JSON.parse(raw);}catch{return new Response(JSON.stringify({error:"Solicitud inválida."}),{status:400,headers:{"Content-Type":"application/json"}});}
    }
    let status=200;
    const headers=new Headers(security);
    const response={
      setHeader(key,value){headers.set(key,value);},
      status(value){status=value;return response;},
      json(value){headers.set("Content-Type","application/json; charset=utf-8");return new Response(JSON.stringify(value),{status,headers});},
      send(value){return new Response(value,{status,headers});}
    };
    return handler({method:request.method,body,headers:Object.fromEntries(request.headers),query:Object.fromEntries(url.searchParams)},response,env,{boombox,pixmedia,orbit,nova});
  }
};
