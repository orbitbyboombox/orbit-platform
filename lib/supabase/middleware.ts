import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isInvalidSessionError } from "./auth-errors";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: new Headers(request.headers) } });
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return NextResponse.redirect(new URL("/login", request.url));
  const cookieDefaults={httpOnly:true,path:"/",sameSite:"lax" as const,secure:process.env.NODE_ENV==="production"};
  const supabase = createServerClient(url,publishableKey,{cookieOptions:cookieDefaults,cookies:{getAll:()=>request.cookies.getAll(),setAll:(items)=>{items.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request:{headers:new Headers(request.headers)}});items.forEach(({name,value,options})=>response.cookies.set(name,value,{...cookieDefaults,...options}))}}});
  const { data: { user },error } = await supabase.auth.getUser();
  if(error){if(isInvalidSessionError(error))return NextResponse.redirect(new URL("/api/auth/session-expired",request.url));return response}
  if (!user){const login=new URL("/login",request.url);login.searchParams.set("next",request.nextUrl.pathname+request.nextUrl.search);return NextResponse.redirect(login)}
  const{data:profile,error:profileError}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if(profileError)return response;
  if(!profile||!["CEO","ADMINISTRATOR"].includes(profile.role)){return NextResponse.redirect(new URL(profile?.role==="STAFF"?"/login?access=staff":"/login?access=customer",request.url))}
  return response;
}
